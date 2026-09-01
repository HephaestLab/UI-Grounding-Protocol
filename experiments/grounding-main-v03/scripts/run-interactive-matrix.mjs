import { spawn } from 'node:child_process';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

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
const taskField = String(args['task-field'] ?? 'taskIds');
const maxSteps = Number(args['max-steps'] ?? 40);
const maxInfraRetries = Number(args['max-infra-retries'] ?? 3);
const shardCount = Number(args['shard-count'] ?? 1);
const shardIndex = Number(args['shard-index'] ?? 0);
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
assert(
  Number.isInteger(maxInfraRetries) && maxInfraRetries >= 0,
  '--max-infra-retries must be a nonnegative integer',
);
assert(
  Number.isInteger(shardCount) &&
    shardCount >= 1 &&
    Number.isInteger(shardIndex) &&
    shardIndex >= 0 &&
    shardIndex < shardCount,
  '--shard-count must be positive and --shard-index must be in range',
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
let taskIds = Array.isArray(taskList) ? taskList : taskList[taskField];
assert(Array.isArray(taskIds) && taskIds.length > 0, 'Task list is empty');
if (args.limit) taskIds = taskIds.slice(0, Number(args.limit));
const matrixSeed = Number(args.seed ?? taskList.seed ?? 240828);
assert(Number.isInteger(matrixSeed), '--seed must be an integer');
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
const globalJobs = taskIds
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
            `${matrixSeed}:${runId}:${sourceTaskId}:${method}:${model}:${replicate}`,
          ),
        })),
      ),
    ),
  )
  .sort((left, right) => left.rank.localeCompare(right.rank));
const jobs = globalJobs.filter((_, index) => index % shardCount === shardIndex);
assert(
  benchmark !== 'st' || globalJobs.every((job) => job.site),
  'One or more ST tasks have no official site mapping',
);
const suiteCrmOnly =
  benchmark === 'st' && globalJobs.every((job) => job.site === 'suitecrm');
const runtimeAdapter = suiteCrmOnly
  ? await (async () => {
      const adapterRoot = join(
        experimentRoot,
        'runtime-injection',
        'suitecrm-v8',
      );
      const authorityManifest = await readJson(
        join(adapterRoot, 'authority-manifest.json'),
      );
      const adapterMetadata = await readJson(
        join(adapterRoot, 'adapter-metadata.json'),
      );
      return {
        adapterId: adapterMetadata.adapterId,
        adapterDigest: sha256(await readFile(join(adapterRoot, 'adapter.js'))),
        authorityManifestDigest: sha256(canonicalJson(authorityManifest)),
        application: adapterMetadata.application,
        applicationVersion: adapterMetadata.applicationVersion,
      };
    })()
  : null;
assert(
  benchmark !== 'st' || suiteCrmOnly,
  'This runtime-injection runner currently supports only the SuiteCRM development slice',
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
if (benchmark === 'webmall') {
  await runNode(
    join(experimentRoot, 'scripts', 'patch-webmall-browsergym.mjs'),
    [],
  );
}
const stResetScripts = {
  gitlab: 'reset-st-gitlab.mjs',
  shopping_admin: 'reset-st-shopping-admin.mjs',
  suitecrm: 'reset-st-suitecrm.mjs',
};
const runRoot = join(runsRoot, runId);
await mkdir(runRoot, { recursive: true });
if (shardIndex === 0)
  await writeJson(join(runRoot, 'matrix-plan.json'), {
    schemaVersion: '0.3.0',
    kind: 'interactive-matrix',
    benchmark,
    runId,
    taskListPath,
    taskField,
    taskListDigest: sha256(JSON.stringify(taskIds)),
    matrixSeed,
    runtimeAdapter,
    taskCount: taskIds.length,
    methods,
    models,
    replicates,
    maxSteps,
    maxInfraRetries,
    episodeCount: globalJobs.length,
    shardCount,
    orderDigest: sha256(globalJobs.map((job) => job.rank).join('\n')),
    jobs: globalJobs,
  });

const progress = {
  schemaVersion: '0.3.0',
  runId,
  shardCount,
  shardIndex,
  total: jobs.length,
  completed: 0,
  skipped: 0,
  failed: 0,
  updatedAt: new Date().toISOString(),
  failures: [],
};
const shardSuffix =
  shardCount === 1
    ? ''
    : `.shard-${String(shardIndex).padStart(2, '0')}-of-${String(shardCount).padStart(2, '0')}`;
const progressPath = join(runRoot, `progress${shardSuffix}.json`);
const failureLogPath = join(runRoot, `infra-failures${shardSuffix}.jsonl`);

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

async function executeUnfinishedJob(job) {
  let lastError;
  for (let attempt = 0; attempt <= maxInfraRetries; attempt += 1) {
    try {
      const resetEvidence = join(
        runRoot,
        'resets',
        `${job.rank}-attempt-${attempt + 1}.json`,
      );
      if (benchmark === 'webmall') {
        await runNode(join(experimentRoot, 'scripts', 'reset-webmall.mjs'), [
          '--evidence',
          resetEvidence,
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
          resetEvidence,
          ...(job.site === 'gitlab'
            ? [
                '--reset-key',
                `${runId}:${job.method}:${job.model}:${job.replicate}`,
              ]
            : []),
        ]);
      }
      return await runEpisode(job);
    } catch (error) {
      lastError = error;
      await writeFile(
        failureLogPath,
        `${JSON.stringify({
          at: new Date().toISOString(),
          sourceTaskId: job.sourceTaskId,
          method: job.method,
          model: job.model,
          replicate: job.replicate,
          attempt: attempt + 1,
          error: String(error.message ?? error),
        })}\n`,
        { encoding: 'utf8', flag: 'a' },
      );
      if (attempt < maxInfraRetries)
        await delay(Math.min(30_000, 2_000 * 2 ** attempt));
    }
  }
  throw lastError;
}

for (const [index, job] of jobs.entries()) {
  try {
    const scorePath = join(jobRoot(job), 'official-score.json');
    let result;
    if (await exists(scorePath)) {
      result = { status: 'skipped', ...(await readJson(scorePath)) };
    } else {
      result = await executeUnfinishedJob(job);
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
