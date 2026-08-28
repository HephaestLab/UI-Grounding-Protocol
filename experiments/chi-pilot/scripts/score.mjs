import { Buffer } from 'node:buffer';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';

import {
  experimentRoot,
  parseArgs,
  readJson,
  requireString,
  sha256,
  stableStringify,
} from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const runId = requireString(args, 'run');
const runDirectory = join(experimentRoot, '.runs', runId);
const participantDirectory = join(runDirectory, 'participant');
const manifest = await readJson(join(runDirectory, 'private-run.json'));
const task = await readJson(join(runDirectory, 'task.json'));
const answerPath = join(participantDirectory, 'answer.json');
const answerText = await readFile(answerPath, 'utf8');
const answerStat = await stat(answerPath);
const answer = JSON.parse(answerText);
const schema = await readJson(join(participantDirectory, 'answer.schema.json'));
const validateAnswer = new Ajv2020({ allErrors: true }).compile(schema);
const schemaValid = validateAnswer(answer);
const oracle = await readJson(
  join(experimentRoot, 'tasks', manifest.taskId, task.oracle),
);

const fields = [
  'primaryEntity',
  'candidateEntityIds',
  'requiresDisambiguation',
  'safeNextAction',
  'reasonCode',
  'evidenceAuthority',
];
const fieldScores = Object.fromEntries(
  fields.map((field) => [
    field,
    stableStringify(answer[field]) === stableStringify(oracle[field]) ? 1 : 0,
  ]),
);
const exactMatch = schemaValid && Object.values(fieldScores).every(Boolean);
const score = {
  runId,
  taskId: manifest.taskId,
  condition: manifest.condition,
  phase: manifest.phase,
  model: manifest.model,
  reasoning: manifest.reasoning,
  completedAt: answerStat.mtime.toISOString(),
  schemaValid,
  schemaErrors: validateAnswer.errors ?? [],
  exactMatch,
  fieldScores,
  normalizedScore:
    Object.values(fieldScores).reduce((sum, value) => sum + value, 0) /
    fields.length,
  observableCosts: {
    inputUtf8Bytes: manifest.inputBytes.total,
    adaptationGuideUtf8Bytes: manifest.inputBytes.adaptationGuide,
    outputUtf8Bytes: Buffer.byteLength(answerText),
    observableToolCalls: null,
    exactTokenUsage: null,
    wallClockMs: Math.max(
      0,
      answerStat.mtime.getTime() - new Date(manifest.startedAt).getTime(),
    ),
  },
  answerSha256: sha256(answerText),
  oracleSha256: sha256(stableStringify(oracle)),
};
const scoreText = stableStringify(score);
await writeFile(join(runDirectory, 'score.json'), scoreText);
console.log(scoreText);
