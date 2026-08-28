import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  captureBaseline,
  evaluateBrowser,
  screenshotsEqual,
} from './browser.mjs';

import {
  directoryDigest,
  experimentRoot,
  readJson,
  scoreReaderAnswer,
  stableStringify,
  taskById,
  workspaceRoot,
  writePacket,
} from './lib.mjs';

const bank = await readJson(join(experimentRoot, 'task-bank.json'));
const temporaryRoot = await mkdtemp(join(tmpdir(), 'ugp-v02-preflight-'));
const digests = new Set();
try {
  const generatorCheck = spawnSync(
    process.execPath,
    [join(workspaceRoot, 'scripts', 'generate-types.mjs'), '--check'],
    { cwd: workspaceRoot, encoding: 'utf8' },
  );
  if (generatorCheck.status !== 0) {
    throw new Error(
      `Generated types are stale:\n${generatorCheck.stdout}\n${generatorCheck.stderr}`,
    );
  }
  const designCheck = spawnSync(
    process.execPath,
    [join(experimentRoot, 'scripts', 'validate.mjs')],
    { cwd: workspaceRoot, encoding: 'utf8' },
  );
  if (designCheck.status !== 0) {
    throw new Error(
      `Experiment design validation failed:\n${designCheck.stdout}\n${designCheck.stderr}`,
    );
  }
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const directory = join(temporaryRoot, `attempt-${attempt}`);
    await writePacket({
      directory,
      task: taskById(bank, 'commerce-retrofit'),
      condition: 'ugp',
      publicRun: {
        runId: 'deterministic-run',
        armCode: 'opaque-arm',
        study: 'RQ1',
        task: 'opaque-task',
        replicate: 1,
      },
      skillRoot: join(workspaceRoot, 'skills'),
    });
    digests.add(await directoryDigest(join(directory, 'participant')));
  }
  if (digests.size !== 1)
    throw new Error('Packet preparation is not byte-stable');
  const pnpmCli = process.env.npm_execpath;
  if (!pnpmCli) throw new Error('Preflight must run through pnpm');
  let baselineCount = 0;
  for (const task of bank.tasks) {
    for (const condition of ['conventional', 'generic', 'ugp']) {
      const directory = join(temporaryRoot, 'matrix', task.taskId, condition);
      await writePacket({
        directory,
        task,
        condition,
        publicRun: {
          runId: 'matrix-run',
          armCode: 'opaque-arm',
          study: 'RQ1',
          task: 'opaque-task',
          replicate: 1,
        },
        skillRoot: join(workspaceRoot, 'skills'),
      });
      const appDirectory = join(directory, 'participant', 'app');
      const install = spawnSync(
        process.execPath,
        [pnpmCli, 'install', '--ignore-scripts', '--frozen-lockfile=false'],
        { cwd: appDirectory, encoding: 'utf8' },
      );
      if (install.status !== 0)
        throw new Error(
          `${task.taskId}/${condition} starter install failed:\n${install.stdout}\n${install.stderr}`,
        );
      const typecheck = spawnSync(
        process.execPath,
        [
          pnpmCli,
          'exec',
          'tsc',
          '--noEmit',
          '-p',
          join(appDirectory, 'tsconfig.json'),
        ],
        { cwd: workspaceRoot, encoding: 'utf8' },
      );
      if (typecheck.status !== 0)
        throw new Error(
          `${task.taskId}/${condition} starter typecheck failed:\n${typecheck.stdout}\n${typecheck.stderr}`,
        );
      const build = spawnSync(
        process.execPath,
        [pnpmCli, 'exec', 'vite', 'build', appDirectory],
        { cwd: workspaceRoot, encoding: 'utf8' },
      );
      if (build.status !== 0)
        throw new Error(
          `${task.taskId}/${condition} starter build failed:\n${build.stdout}\n${build.stderr}`,
        );
    }
    if (task.workflow === 'retrofit') {
      const appDirectory = join(
        temporaryRoot,
        'matrix',
        task.taskId,
        'conventional',
        'participant',
        'app',
      );
      const baseline = join(temporaryRoot, `${task.taskId}-baseline.png`);
      const evaluation = join(temporaryRoot, `${task.taskId}-evaluation.png`);
      await captureBaseline(appDirectory, baseline);
      const result = await evaluateBrowser({
        appDirectory,
        task,
        condition: 'conventional',
        screenshot: evaluation,
      });
      if (
        !result.targetPresent ||
        !result.targetKeyboardFocusable ||
        !result.hasSearchInput ||
        !result.interactionChangedDom
      ) {
        throw new Error(
          `${task.taskId}: retrofit browser baseline failed ${stableStringify(result)}`,
        );
      }
      if (!(await screenshotsEqual(baseline, evaluation))) {
        throw new Error(
          `${task.taskId}: an unmodified retrofit did not reproduce its baseline screenshot`,
        );
      }
      baselineCount += 1;
    }
  }
  if (baselineCount !== 4) throw new Error('Expected four retrofit baselines');

  const scoreTask = taskById(bank, 'commerce-greenfield');
  const facts = Object.fromEntries(
    scoreTask.controlledFacts.map((fact) => [fact.id, fact.value]),
  );
  const answer = {
    referent: facts.identity,
    facts,
    capability: facts.capability,
    shouldInvoke: false,
    uncertainties: [],
  };
  const scoreInput = { runId: 'deterministic-score', inferential: false };
  const scoreA = stableStringify(
    scoreReaderAnswer(scoreTask, answer, scoreInput),
  );
  const scoreB = stableStringify(
    scoreReaderAnswer(scoreTask, answer, scoreInput),
  );
  if (scoreA !== scoreB) throw new Error('RQ2 scoring is not byte-stable');
  const readiness = {
    status: 'pre-experiment',
    generatedAt: new Date().toISOString(),
    gates: {
      schemaAndTypesStable: true,
      fourDomainGrammarValidated: true,
      skillsStructureValidated: true,
      skillsIndependentForwardTests: false,
      taskPacketsValidated: true,
      privateFilesExcluded: true,
      retrofitBaselinesCaptured: true,
      prepareReset50Of50: true,
      scorerByteStable: true,
      calibrationNoCeilingOrFloor: false,
      crossDomainTransferPrepared: true,
      formalDesignFrozen: false,
    },
    note: 'Remaining false gates require independent model calibration and an explicit later design freeze; preparation scripts cannot assert them.',
  };
  await writeFile(
    join(experimentRoot, 'readiness.json'),
    stableStringify(readiness),
  );
  console.log(stableStringify(readiness));
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
