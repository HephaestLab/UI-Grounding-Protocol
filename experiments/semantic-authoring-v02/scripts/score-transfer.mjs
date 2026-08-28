import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';

import {
  experimentRoot,
  parseArgs,
  readJson,
  required,
  scoreReaderAnswer,
  stableStringify,
  taskById,
} from './lib.mjs';

const runId = required(parseArgs(process.argv.slice(2)), 'run');
if (!/^[a-z0-9-]+$/u.test(runId)) throw new Error('Invalid run ID');
const runDirectory = join(experimentRoot, '.runs', runId);
const participant = join(runDirectory, 'participant');
const privateRun = await readJson(join(runDirectory, 'private-run.json'));
if (privateRun.study !== 'RQ2-transfer') throw new Error('Not a transfer run');
if (!privateRun.phaseTwoRevealedAt)
  throw new Error('Phase two was not revealed');
const schema = await readJson(
  join(experimentRoot, 'schemas', 'reader-answer.schema.json'),
);
const validate = new Ajv2020({ allErrors: true }).compile(schema);
const initial = await readJson(join(participant, 'answer.initial.json'));
const final = await readJson(join(participant, 'answer.final.json'));
if (!validate(initial) || !validate(final)) {
  throw new Error(
    `Invalid transfer answer: ${JSON.stringify(validate.errors)}`,
  );
}
const bank = await readJson(join(experimentRoot, 'task-bank.json'));
const task = taskById(bank, privateRun.heldOutTask);
const initialScore = scoreReaderAnswer(task, initial, privateRun);
const finalScore = scoreReaderAnswer(task, final, privateRun);
const score = {
  runId,
  study: 'RQ2-transfer',
  inferential: privateRun.inferential,
  condition: privateRun.condition,
  initial: initialScore,
  final: finalScore,
  factAccuracyDelta: finalScore.factAccuracy - initialScore.factAccuracy,
  referentRecoveredAfterGuide:
    !initialScore.referentCorrect && finalScore.referentCorrect,
};
await writeFile(
  join(runDirectory, 'transfer-score.json'),
  stableStringify(score),
);
console.log(stableStringify(score));
