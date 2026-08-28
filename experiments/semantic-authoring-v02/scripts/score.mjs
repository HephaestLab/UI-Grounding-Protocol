import { Buffer } from 'node:buffer';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import Ajv2020 from 'ajv/dist/2020.js';

import { evaluateBrowser, screenshotsEqual } from './browser.mjs';

import {
  experimentRoot,
  parseArgs,
  readJson,
  required,
  scoreReaderAnswer,
  stableStringify,
  taskById,
} from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const runId = required(args, 'run');
if (!/^[a-z0-9-]+$/u.test(runId)) throw new Error('Invalid run ID');
const runDirectory = join(experimentRoot, '.runs', runId);
const privateRun = await readJson(join(runDirectory, 'private-run.json'));
const bank = await readJson(join(experimentRoot, 'task-bank.json'));
const task = taskById(bank, privateRun.taskId);
const participant = join(runDirectory, 'participant');

let score;
if (privateRun.study === 'RQ2') {
  const answer = await readJson(join(participant, 'answer.json'));
  const schema = await readJson(
    join(experimentRoot, 'schemas', 'reader-answer.schema.json'),
  );
  const validate = new Ajv2020({ allErrors: true }).compile(schema);
  if (!validate(answer))
    throw new Error(`Invalid answer: ${JSON.stringify(validate.errors)}`);
  score = scoreReaderAnswer(task, answer, privateRun);
} else {
  const audit = await readJson(join(participant, 'AUDIT.json'));
  const schema = await readJson(
    join(experimentRoot, 'schemas', 'audit.schema.json'),
  );
  const validate = new Ajv2020({ allErrors: true }).compile(schema);
  if (!validate(audit))
    throw new Error(`Invalid audit: ${JSON.stringify(validate.errors)}`);
  const sourceRoot = join(participant, 'app', 'src');
  const source = await readSourceTree(sourceRoot);
  const pnpmCli = process.env.npm_execpath;
  if (!pnpmCli) throw new Error('RQ1 scoring must run through pnpm');
  const build = spawnSync(
    process.execPath,
    [pnpmCli, 'exec', 'vite', 'build'],
    { cwd: join(participant, 'app'), encoding: 'utf8' },
  );
  const conditionChecks = {
    conventional: true,
    generic:
      source.includes('targetMeaning') &&
      (await exists(join(sourceRoot, 'meaning', 'manifest.ts'))),
    ugp:
      source.includes('targetBinding') &&
      source.includes('defineProfile') &&
      source.includes('useUgpLink') &&
      source.includes('GroundingInspector') &&
      (await exists(join(sourceRoot, 'ugp', 'manifest.ts'))),
  };
  await mkdir(join(runDirectory, 'private'), { recursive: true });
  const evaluationScreenshot = join(runDirectory, 'private', 'evaluation.png');
  const browser =
    build.status === 0
      ? await evaluateBrowser({
          appDirectory: join(participant, 'app'),
          task,
          condition: privateRun.condition,
          screenshot: evaluationScreenshot,
        })
      : null;
  const baselinePath = join(runDirectory, 'private', 'baseline.png');
  const visualExact =
    task.workflow === 'retrofit' && browser
      ? await screenshotsEqual(baselinePath, evaluationScreenshot)
      : null;
  const semanticFactCoverage = browser?.semanticOutput
    ? task.controlledFacts.filter((fact) =>
        containsValue(browser.semanticOutput, fact.value),
      ).length / task.controlledFacts.length
    : null;
  score = {
    runId,
    study: 'RQ1',
    inferential: privateRun.inferential,
    auditStatus: audit.status,
    buildPassed: build.status === 0,
    targetMarkerPresent: source.includes(task.target.testId),
    assignedConditionStructurePresent: conditionChecks[privateRun.condition],
    browser,
    semanticFactCoverage,
    retrofitScreenshotExact: visualExact,
    semanticGapCount: audit.semanticGaps.length,
    changedFileCount: audit.changedFiles.length,
    sourceBytes: Buffer.byteLength(source),
    hiddenBrowserAcceptance:
      Boolean(browser?.targetPresent && browser.targetKeyboardFocusable) &&
      (privateRun.condition === 'conventional' ||
        Boolean(browser.inspectorPresent && semanticFactCoverage === 1)),
    buildError:
      build.status === 0
        ? null
        : `${build.stdout}\n${build.stderr}`.slice(0, 4000),
  };
}

await writeFile(join(runDirectory, 'score.json'), stableStringify(score));
console.log(stableStringify(score));

async function exists(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function readSourceTree(directory) {
  const chunks = [];
  async function visit(path) {
    for (const entry of (await readdir(path, { withFileTypes: true })).sort(
      (a, b) => a.name.localeCompare(b.name),
    )) {
      const child = join(path, entry.name);
      if (entry.isDirectory()) await visit(child);
      else if (/\.(?:ts|tsx|json|css)$/u.test(entry.name))
        chunks.push(await readFile(child, 'utf8'));
    }
  }
  await visit(directory);
  return chunks.join('\n');
}

function containsValue(container, expected) {
  if (stableStringify(container) === stableStringify(expected)) return true;
  if (Array.isArray(container))
    return container.some((item) => containsValue(item, expected));
  if (!container || typeof container !== 'object') return false;
  return Object.values(container).some((item) => containsValue(item, expected));
}
