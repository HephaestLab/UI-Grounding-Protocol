import { spawn } from 'node:child_process';
import { access, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import {
  assert,
  canonicalJson,
  experimentRoot,
  parseArgs,
  readJson,
  required,
  resolveInput,
  runsRoot,
  sha256,
  writeJson,
} from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const benchmark = required(args, 'benchmark');
const runId = required(args, 'run-id');
const taskListPath = resolveInput(required(args, 'task-list'));
const maxSteps = Number(args['max-steps'] ?? 40);
const methods = String(args.methods ?? 'vision-only,ugp')
  .split(',')
  .filter(Boolean);
const models = String(args.models ?? 'gpt-5.6-luna,gpt-5.4')
  .split(',')
  .filter(Boolean);
const replicates = String(args.replicates ?? '1')
  .split(',')
  .map(Number);
assert(
  ['webmall', 'st'].includes(benchmark),
  '--benchmark must be webmall or st',
);
assert(/^[A-Za-z0-9._-]+$/u.test(runId), '--run-id contains unsafe characters');
assert(
  Number.isInteger(maxSteps) && maxSteps >= 1 && maxSteps <= 100,
  '--max-steps must be an integer from 1 through 100',
);
assert(methods.length > 0 && models.length > 0, 'Matrix factors are empty');
assert(
  methods.every((value) => !/\s/u.test(value)) &&
    models.every((value) => !/\s/u.test(value)),
  'Method and model lists must be comma-separated and shell-quoted',
);
assert(
  replicates.length > 0 &&
    replicates.every((value) => Number.isInteger(value) && value >= 1),
  'Replicates must be positive integers',
);

const taskList = await readJson(taskListPath);
let taskIds = Array.isArray(taskList) ? taskList : taskList.taskIds;
assert(Array.isArray(taskIds) && taskIds.length > 0, 'Task list is empty');
if (args.limit) taskIds = taskIds.slice(0, Number(args.limit));
const stTaskSites =
  benchmark === 'st'
    ? new Map(
        (
          await readJson(
            join(
              experimentRoot,
              'vendor',
              'st-webagentbench',
              'stwebagentbench',
              'test.raw.json',
            ),
          )
        ).map((task) => [`st:${task.task_id}`, task.sites?.[0]]),
      )
    : null;
const jobs = taskIds
  .flatMap((sourceTaskId) =>
    methods.flatMap((method) =>
      models.flatMap((model) =>
        replicates.map((replicate) => ({
          sourceTaskId,
          method,
          model,
          replicate,
          site: stTaskSites?.get(sourceTaskId) ?? null,
          rank: sha256(
            `240828:${runId}:${sourceTaskId}:${method}:${model}:${replicate}`,
          ),
        })),
      ),
    ),
  )
  .sort((left, right) => left.rank.localeCompare(right.rank));
assert(
  benchmark !== 'st' || jobs.every((job) => job.site),
  'One or more ST tasks have no official site mapping',
);

const configurations = {
  webmall: {
    project: join(experimentRoot, 'interactive-tools-webmall'),
    environment:
      process.env.UGP_WEBMALL_PYTHON_ENV ?? 'E:/UGP-exp-data/python-webmall',
    script: join(
      experimentRoot,
      'interactive-tools-webmall',
      'run_webmall_episode.py',
    ),
  },
  st: {
    project: join(experimentRoot, 'interactive-tools'),
    environment:
      process.env.UGP_ST_PYTHON_ENV ?? 'E:/UGP-exp-data/python-interactive',
    script: join(experimentRoot, 'interactive-tools', 'run_st_episode.py'),
  },
};
const configuration = configurations[benchmark];
const stResetScripts = {
  gitlab: 'reset-st-gitlab.mjs',
  shopping_admin: 'reset-st-shopping-admin.mjs',
  suitecrm: 'reset-st-suitecrm.mjs',
};
const runRoot = join(runsRoot, runId);
await mkdir(runRoot, { recursive: true });
await writeJson(join(runRoot, 'matrix-plan.json'), {
  schemaVersion: '0.3.0',
  kind: 'interactive-matrix',
  benchmark,
  runId,
  taskListPath,
  taskListDigest: sha256(JSON.stringify(taskIds)),
  taskCount: taskIds.length,
  methods,
  models,
  replicates,
  maxSteps,
  episodeCount: jobs.length,
  orderDigest: sha256(jobs.map((job) => job.rank).join('\n')),
  jobs,
});

const progress = {
  schemaVersion: '0.3.0',
  runId,
  total: jobs.length,
  completed: 0,
  skipped: 0,
  failed: 0,
  updatedAt: new Date().toISOString(),
  failures: [],
};
const progressPath = join(runRoot, 'progress.json');

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

function jobRoot(job) {
  const jobId = sha256(
    canonicalJson({
      method: job.method,
      model: job.model,
      replicate: job.replicate,
      runId,
      sourceTaskId: job.sourceTaskId,
    }),
  ).slice(0, 24);
  return join(runRoot, 'tasks', jobId);
}

function runNode(script, scriptArgs) {
  return new Promise((complete, reject) => {
    const child = spawn(process.execPath, [script, ...scriptArgs], {
      cwd: experimentRoot,
      env: process.env,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) complete(stdout.trim());
      else
        reject(
          new Error(stderr.trim() || stdout.trim() || `node exited ${code}`),
        );
    });
  });
}

function runEpisode(job) {
  return new Promise((complete, reject) => {
    const child = spawn(
      'uv',
      [
        'run',
        '--project',
        configuration.project,
        '--frozen',
        '--no-sync',
        'python',
        configuration.script,
        '--task-id',
        job.sourceTaskId,
        '--method',
        job.method,
        '--model',
        job.model,
        '--run-id',
        runId,
        '--replicate',
        String(job.replicate),
        '--max-steps',
        String(maxSteps),
      ],
      {
        cwd: experimentRoot,
        env: {
          ...process.env,
          PLAYWRIGHT_BROWSERS_PATH:
            process.env.PLAYWRIGHT_BROWSERS_PATH ??
            'E:/UGP-exp-data/ms-playwright',
          UV_PROJECT_ENVIRONMENT: configuration.environment,
        },
        shell: false,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(stderr.trim() || stdout.trim() || `uv exited ${code}`),
        );
        return;
      }
      const lines = stdout.trim().split(/\r?\n/u).filter(Boolean);
      try {
        complete(JSON.parse(lines.at(-1)));
      } catch {
        reject(new Error(`Episode returned invalid output: ${stdout.trim()}`));
      }
    });
  });
}

for (const [index, job] of jobs.entries()) {
  try {
    const scorePath = join(jobRoot(job), 'official-score.json');
    let result;
    if (await exists(scorePath)) {
      result = { status: 'skipped', ...(await readJson(scorePath)) };
    } else {
      if (benchmark === 'webmall') {
        await runNode(join(experimentRoot, 'scripts', 'reset-webmall.mjs'), [
          '--evidence',
          join(runRoot, 'resets', `${job.rank}.json`),
        ]);
      }
      if (benchmark === 'st') {
        const resetScript = stResetScripts[job.site];
        assert(
          resetScript,
          `No reset script is registered for ST site ${job.site}`,
        );
        await runNode(join(experimentRoot, 'scripts', resetScript), [
          '--evidence',
          join(runRoot, 'resets', `${job.rank}.json`),
        ]);
      }
      result = await runEpisode(job);
    }
    const status = result.status === 'skipped' ? 'skipped' : 'completed';
    progress[status] += 1;
    console.log(
      JSON.stringify({
        progress: index + 1,
        total: jobs.length,
        status,
        sourceTaskId: job.sourceTaskId,
        method: job.method,
        model: job.model,
        replicate: job.replicate,
        strictSuccess: result.strictSuccess,
        steps: result.steps,
      }),
    );
  } catch (error) {
    progress.failed += 1;
    const failure = {
      sourceTaskId: job.sourceTaskId,
      method: job.method,
      model: job.model,
      replicate: job.replicate,
      error: String(error.message ?? error),
    };
    progress.failures.push(failure);
    console.error(JSON.stringify({ progress: index + 1, ...failure }));
  }
  progress.updatedAt = new Date().toISOString();
  await writeJson(progressPath, progress);
}

console.log(JSON.stringify(progress));
if (progress.failed > 0) process.exitCode = 1;
