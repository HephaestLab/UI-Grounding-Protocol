import { spawn } from 'node:child_process';
import { access, mkdir, writeFile } from 'node:fs/promises';
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
const concurrency = Number(args.concurrency ?? 2);
const maxInfraRetries = Number(args['max-infra-retries'] ?? 3);
const methods = String(
  args.methods ??
    'vision-only,html-ax,tree-of-lens,iai-p4,rag-context,mcp-resource,nlweb-context,ugp',
)
  .split(',')
  .filter(Boolean);
const models = String(args.models ?? 'gpt-5.6-luna,gpt-5.4')
  .split(',')
  .filter(Boolean);
const replicates = String(args.replicates ?? '1')
  .split(',')
  .map(Number);
assert(
  Number.isInteger(concurrency) && concurrency >= 1 && concurrency <= 32,
  '--concurrency must be an integer from 1 through 32',
);
assert(
  Number.isInteger(maxInfraRetries) && maxInfraRetries >= 0,
  '--max-infra-retries must be a nonnegative integer',
);
assert(/^[A-Za-z0-9._-]+$/u.test(runId), '--run-id contains unsafe characters');
assert(methods.length > 0, 'At least one method is required');
assert(models.length > 0, 'At least one model is required');
assert(
  replicates.length > 0 &&
    replicates.every((value) => Number.isInteger(value) && value >= 1),
  'Replicates must be positive integers',
);

const benchmarkDirectories = {
  screenpr: 'screenpr-referent',
  screenqa: 'screenqa-visible',
};
const benchmarkDirectory = benchmarkDirectories[benchmark];
assert(benchmarkDirectory, '--benchmark must be either screenpr or screenqa');
const manifest = await readJson(
  join(runsRoot, 'materialized-static', benchmarkDirectory, 'manifest.json'),
);
let selectedTasks = manifest.tasks;
if (args['task-list']) {
  const taskList = await readJson(resolveInput(String(args['task-list'])));
  const selectedIds = new Set(
    Array.isArray(taskList) ? taskList : (taskList.taskIds ?? []),
  );
  selectedTasks = selectedTasks.filter((task) =>
    selectedIds.has(task.sourceTaskId),
  );
  assert(
    selectedTasks.length === selectedIds.size,
    `Task list matched ${selectedTasks.length} of ${selectedIds.size} ids`,
  );
}
if (args.limit) selectedTasks = selectedTasks.slice(0, Number(args.limit));

const jobs = selectedTasks
  .flatMap((task) =>
    methods.flatMap((method) =>
      models.flatMap((model) =>
        replicates.map((replicate) => ({
          task,
          method,
          model,
          replicate,
          rank: sha256(
            `240828:${runId}:${task.sourceTaskId}:${method}:${model}:${replicate}`,
          ),
        })),
      ),
    ),
  )
  .sort((left, right) => left.rank.localeCompare(right.rank));
assert(jobs.length > 0, 'Matrix contains no jobs');

const runRoot = join(runsRoot, runId);
await mkdir(runRoot, { recursive: true });
await writeJson(join(runRoot, 'matrix-plan.json'), {
  schemaVersion: '0.3.0',
  kind: 'static-matrix',
  runId,
  benchmarkId: manifest.benchmarkId,
  sourceManifestDigest: manifest.manifestDigest,
  methods,
  models,
  replicates,
  concurrency,
  maxInfraRetries,
  taskCount: selectedTasks.length,
  episodeCount: jobs.length,
  orderDigest: sha256(jobs.map((job) => job.rank).join('\n')),
  jobs: jobs.map((job) => ({
    sourceTaskId: job.task.sourceTaskId,
    method: job.method,
    model: job.model,
    replicate: job.replicate,
    rank: job.rank,
  })),
});

const scripts = Object.fromEntries(
  ['prepare', 'run-codex-actor', 'record', 'score'].map((name) => [
    name,
    join(experimentRoot, 'scripts', `${name}.mjs`),
  ]),
);

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
      if (code === 0) {
        complete(stdout.trim());
      } else {
        reject(
          new Error(
            `${script.split(/[\\/]/u).at(-1)} exited ${code}: ${stderr.trim() || stdout.trim()}`,
          ),
        );
      }
    });
  });
}

function episodeIdFor(job) {
  return sha256(
    canonicalJson({
      methodId: job.method,
      modelId: job.model,
      replicate: job.replicate,
      runId,
      taskId: job.task.sourceTaskId,
    }),
  ).slice(0, 24);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

const progress = {
  schemaVersion: '0.3.0',
  runId,
  total: jobs.length,
  completed: 0,
  skipped: 0,
  failed: 0,
  active: 0,
  updatedAt: new Date().toISOString(),
  failures: [],
};
const progressPath = join(runRoot, 'progress.json');
const failureLogPath = join(runRoot, 'infra-failures.jsonl');
let progressWrite = Promise.resolve();

function saveProgress() {
  progress.updatedAt = new Date().toISOString();
  const snapshot = JSON.parse(JSON.stringify(progress));
  progressWrite = progressWrite.then(() => writeJson(progressPath, snapshot));
  return progressWrite;
}

async function executeJob(job) {
  const episodeId = episodeIdFor(job);
  const episodeRoot = join(runRoot, 'episodes', episodeId);
  const requestPath = join(episodeRoot, 'request.json');
  const responsePath = join(episodeRoot, 'response.json');
  const trajectoryPath = join(episodeRoot, 'trajectory.json');
  const scorePath = join(episodeRoot, 'score.json');
  if (await exists(scorePath)) return { status: 'skipped', episodeId };

  await runNode(scripts.prepare, [
    '--task',
    job.task.taskPath,
    '--method',
    job.method,
    '--model',
    job.model,
    '--run-id',
    runId,
    '--replicate',
    String(job.replicate),
  ]);

  let lastError;
  for (let attempt = 0; attempt <= maxInfraRetries; attempt += 1) {
    try {
      await runNode(scripts['run-codex-actor'], ['--request', requestPath]);
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      await writeFile(
        failureLogPath,
        `${JSON.stringify({
          at: new Date().toISOString(),
          episodeId,
          sourceTaskId: job.task.sourceTaskId,
          method: job.method,
          model: job.model,
          replicate: job.replicate,
          attempt: attempt + 1,
          error: String(error.message ?? error),
        })}\n`,
        { encoding: 'utf8', flag: 'a' },
      );
      if (attempt < maxInfraRetries) {
        await delay(Math.min(30_000, 2_000 * 2 ** attempt));
      }
    }
  }
  if (lastError) throw lastError;

  await runNode(scripts.record, [
    '--request',
    requestPath,
    '--response',
    responsePath,
  ]);
  await runNode(scripts.score, [
    '--trajectory',
    trajectoryPath,
    '--gold',
    job.task.goldPath,
  ]);
  return { status: 'completed', episodeId };
}

let nextJob = 0;
async function worker() {
  while (nextJob < jobs.length) {
    const jobIndex = nextJob;
    nextJob += 1;
    const job = jobs[jobIndex];
    progress.active += 1;
    await saveProgress();
    try {
      const result = await executeJob(job);
      progress[result.status] += 1;
      console.log(
        JSON.stringify({
          progress: progress.completed + progress.skipped + progress.failed,
          total: progress.total,
          status: result.status,
          episodeId: result.episodeId,
          sourceTaskId: job.task.sourceTaskId,
          method: job.method,
          model: job.model,
          replicate: job.replicate,
        }),
      );
    } catch (error) {
      progress.failed += 1;
      progress.failures.push({
        sourceTaskId: job.task.sourceTaskId,
        method: job.method,
        model: job.model,
        replicate: job.replicate,
        error: String(error.message ?? error),
      });
      console.error(
        JSON.stringify({
          progress: progress.completed + progress.skipped + progress.failed,
          total: progress.total,
          status: 'failed',
          sourceTaskId: job.task.sourceTaskId,
          method: job.method,
          model: job.model,
          replicate: job.replicate,
          error: String(error.message ?? error),
        }),
      );
    } finally {
      progress.active -= 1;
      await saveProgress();
    }
  }
}

await Promise.all(
  Array.from({ length: Math.min(concurrency, jobs.length) }, () => worker()),
);
await saveProgress();
console.log(JSON.stringify(progress));
if (progress.failed > 0) process.exitCode = 1;
