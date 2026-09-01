import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';

import {
  experimentRoot,
  parseArgs,
  readJson,
  required,
  resolveInput,
  runsRoot,
  writeJson,
} from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const runId = required(args, 'run-id');
const taskListPath = resolveInput(required(args, 'task-list'));
const workersPath = resolveInput(required(args, 'workers'));
const workerManifest = await readJson(workersPath);
const workers = workerManifest.workers;
if (!Array.isArray(workers) || workers.length !== 4)
  throw new Error('The paired pilot requires exactly four isolated workers');
const runRoot = join(runsRoot, runId);
const orchestrationPath = join(runRoot, 'orchestration.json');
const matrixScript = join(
  experimentRoot,
  'scripts',
  'run-interactive-matrix.mjs',
);
const commonArgs = [
  '--benchmark',
  'st',
  '--run-id',
  runId,
  '--task-list',
  taskListPath,
  '--methods',
  'html-ax,ugp',
  '--models',
  String(args.models ?? 'gpt-5.6-luna,gpt-5.4'),
  '--replicates',
  '1',
  '--max-steps',
  String(args['max-steps'] ?? 40),
  '--max-infra-retries',
  String(args['max-infra-retries'] ?? 3),
  '--shard-count',
  String(workers.length),
];

function run(command, commandArgs, environment = process.env) {
  return new Promise((complete, reject) => {
    const child = spawn(command, commandArgs, {
      cwd: experimentRoot,
      env: environment,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.once('error', reject);
    child.once('close', (code) => complete({ code, stdout, stderr }));
  });
}

const workerState = workers.map((worker) => ({
  ...worker,
  status: 'pending',
  pass: 0,
}));
let recordQueue = Promise.resolve();
function record(status) {
  const snapshot = {
    schemaVersion: '0.3.0',
    runId,
    status,
    taskListPath,
    workersPath,
    workers: JSON.parse(JSON.stringify(workerState)),
    updatedAt: new Date().toISOString(),
  };
  recordQueue = recordQueue.then(() => writeJson(orchestrationPath, snapshot));
  return recordQueue;
}
await record('running');

await Promise.all(
  workerState.map(async (worker) => {
    const suffix = `.shard-${String(worker.index).padStart(2, '0')}-of-04`;
    const progressPath = join(runRoot, `progress${suffix}.json`);
    for (let pass = 1; pass <= 3; pass += 1) {
      worker.status = 'running';
      worker.pass = pass;
      await record('running');
      const environment = {
        ...process.env,
        WA_SUITECRM: worker.url,
        UGP_ST_SUITECRM_APPLICATION_CONTAINER: worker.applicationContainer,
        UGP_ST_SUITECRM_DATABASE_CONTAINER: worker.databaseContainer,
      };
      const result = await run(
        process.execPath,
        [matrixScript, ...commonArgs, '--shard-index', String(worker.index)],
        environment,
      );
      await writeFile(
        join(runRoot, `worker-${worker.index}-pass-${pass}.log`),
        `${result.stdout}\n${result.stderr}`,
        'utf8',
      );
      const progress = await readJson(progressPath);
      worker.progress = progress;
      if (
        progress.failed === 0 &&
        progress.completed + progress.skipped === progress.total
      ) {
        worker.status = 'complete';
        await record('running');
        return;
      }
    }
    worker.status = 'failed';
    await record('failed');
    throw new Error(`Worker ${worker.index} remains incomplete after 3 passes`);
  }),
);

for (const scriptName of [
  'audit-interactive-run.mjs',
  'summarize-interactive.mjs',
]) {
  const result = await run(process.execPath, [
    join(experimentRoot, 'scripts', scriptName),
    '--run-id',
    runId,
  ]);
  if (result.code !== 0)
    throw new Error(result.stderr || result.stdout || `${scriptName} failed`);
}
await record('complete');
console.log(
  JSON.stringify({ runId, status: 'complete', workers: workerState }),
);
