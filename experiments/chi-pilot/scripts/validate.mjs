import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';

import { experimentRoot, readJson, sha256, stableStringify } from './lib.mjs';

const design = await readJson(join(experimentRoot, 'design.json'));
if (design.status !== 'calibration-only') {
  throw new Error('The initial design must remain calibration-only');
}

const answerSchema = await readJson(
  join(experimentRoot, 'schemas', 'reader-answer.schema.json'),
);
const validateAnswer = new Ajv2020({ allErrors: true }).compile(answerSchema);
const taskRoot = join(experimentRoot, 'tasks');
const taskDirectories = (
  await readdir(taskRoot, { withFileTypes: true })
).filter((entry) => entry.isDirectory());

if (taskDirectories.length === 0) throw new Error('No experiment tasks found');

const ugpGuideHashes = new Set();
const adHocGuideHashes = new Set();

for (const entry of taskDirectories) {
  const directory = join(taskRoot, entry.name);
  const task = await readJson(join(directory, 'task.json'));
  if (task.taskId !== entry.name) {
    throw new Error(`${entry.name}: taskId must match its directory`);
  }
  const conditionNames = Object.keys(task.conditions).sort();
  const expected = [...design.conditions[task.study]].sort();
  if (stableStringify(conditionNames) !== stableStringify(expected)) {
    throw new Error(`${task.taskId}: conditions do not match ${task.study}`);
  }

  const controlled = stableStringify([...task.controlledFactIds].sort());
  for (const condition of ['adhoc', 'ugp']) {
    const arm = task.conditions[condition];
    if (stableStringify([...arm.factIds].sort()) !== controlled) {
      throw new Error(
        `${task.taskId}: ${condition} does not expose the controlled fact set`,
      );
    }
  }

  for (const arm of Object.values(task.conditions)) {
    JSON.parse(await readFile(join(directory, arm.input), 'utf8'));
    if (arm.guide) await readFile(join(directory, arm.guide), 'utf8');
  }
  for (const condition of ['adhoc', 'ugp']) {
    const guidePath = task.conditions[condition].guide;
    if (!guidePath)
      throw new Error(`${task.taskId}: ${condition} needs a guide`);
    const guideHash = sha256(
      await readFile(join(directory, guidePath), 'utf8'),
    );
    if (condition === 'ugp') ugpGuideHashes.add(guideHash);
    else adHocGuideHashes.add(guideHash);
  }
  const oracle = await readJson(join(directory, task.oracle));
  if (!validateAnswer(oracle)) {
    throw new Error(
      `${task.taskId}: invalid oracle ${JSON.stringify(validateAnswer.errors)}`,
    );
  }
}

if (ugpGuideHashes.size !== 1) {
  throw new Error('Every UGP task must reuse one shared reader contract');
}
if (adHocGuideHashes.size !== taskDirectories.length) {
  throw new Error('Every ad-hoc application must use its own adaptation guide');
}

console.log(`Validated ${taskDirectories.length} CHI Pilot task(s)`);
