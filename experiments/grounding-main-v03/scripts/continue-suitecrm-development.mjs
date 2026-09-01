import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import {
  experimentRoot,
  parseArgs,
  readJson,
  required,
  runsRoot,
  writeJson,
} from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const primaryPid = Number(required(args, 'primary-pid'));
if (!Number.isInteger(primaryPid) || primaryPid <= 0) {
  throw new Error('--primary-pid must be a positive integer');
}

const taskList = join(
  experimentRoot,
  'sampling',
  'suitecrm-development-v1.json',
);
const matrixScript = join(
  experimentRoot,
  'scripts',
  'run-interactive-matrix.mjs',
);
const primaryRunId = 'suitecrm-development-v1-primary';
const robustnessRunId = 'suitecrm-development-v1-robustness-r2-r3';
const commonMatrixArgs = [
  '--benchmark',
  'st',
  '--task-list',
  taskList,
  '--methods',
  'vision-only,html-ax,tree-of-lens,iai-p4,rag-context,mcp-resource,nlweb-context,ugp',
  '--models',
  'gpt-5.6-luna,gpt-5.4',
  '--max-steps',
  '40',
  '--max-infra-retries',
  '3',
];

function processAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function runNode(script, scriptArgs) {
  const child = spawn(process.execPath, [script, ...scriptArgs], {
    cwd: experimentRoot,
    env: process.env,
    shell: false,
    windowsHide: true,
    stdio: 'inherit',
  });
  return await new Promise((complete, reject) => {
    child.once('error', reject);
    child.once('close', complete);
  });
}

async function progressFor(runId) {
  try {
    return await readJson(join(runsRoot, runId, 'progress.json'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function complete(progress) {
  return (
    progress &&
    progress.failed === 0 &&
    progress.completed + progress.skipped === progress.total
  );
}

async function ensureMatrix(runId, matrixArgs) {
  for (let pass = 1; pass <= 5; pass += 1) {
    const before = await progressFor(runId);
    if (complete(before)) return before;
    console.log(
      JSON.stringify({ event: 'matrix-pass-start', runId, pass, before }),
    );
    const exitCode = await runNode(matrixScript, [
      '--run-id',
      runId,
      ...commonMatrixArgs,
      ...matrixArgs,
    ]);
    const after = await progressFor(runId);
    console.log(
      JSON.stringify({
        event: 'matrix-pass-end',
        runId,
        pass,
        exitCode,
        after,
      }),
    );
    if (complete(after)) return after;
  }
  throw new Error(`${runId} remains incomplete after five resumable passes`);
}

const orchestrationPath = join(
  runsRoot,
  'suitecrm-development-v1-orchestration.json',
);
await writeJson(orchestrationPath, {
  schemaVersion: '0.3.0',
  status: 'waiting-for-primary',
  primaryPid,
  primaryRunId,
  robustnessRunId,
  updatedAt: new Date().toISOString(),
});

while (processAlive(primaryPid)) await delay(30_000);

const primary = await ensureMatrix(primaryRunId, ['--replicates', '1']);
await runNode(join(experimentRoot, 'scripts', 'audit-interactive-run.mjs'), [
  '--run-id',
  primaryRunId,
]);
await runNode(join(experimentRoot, 'scripts', 'summarize-interactive.mjs'), [
  '--run-id',
  primaryRunId,
]);
await writeJson(orchestrationPath, {
  schemaVersion: '0.3.0',
  status: 'running-robustness',
  primaryPid,
  primaryRunId,
  robustnessRunId,
  primary,
  updatedAt: new Date().toISOString(),
});

const robustness = await ensureMatrix(robustnessRunId, [
  '--task-field',
  'robustnessSourceTaskIds',
  '--replicates',
  '2,3',
]);
await runNode(join(experimentRoot, 'scripts', 'audit-interactive-run.mjs'), [
  '--run-id',
  robustnessRunId,
]);
await runNode(join(experimentRoot, 'scripts', 'summarize-interactive.mjs'), [
  '--run-id',
  robustnessRunId,
]);
await writeJson(orchestrationPath, {
  schemaVersion: '0.3.0',
  status: 'complete',
  primaryPid,
  primaryRunId,
  robustnessRunId,
  primary,
  robustness,
  completedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});
console.log(
  JSON.stringify({
    event: 'suitecrm-development-complete',
    primary,
    robustness,
  }),
);
