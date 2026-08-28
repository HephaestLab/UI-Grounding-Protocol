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
if (!manifest.phaseTwoRevealedAt) {
  throw new Error('Phase two has not been revealed for this session');
}
const schema = await readJson(join(participantDirectory, 'answer.schema.json'));
const validateAnswer = new Ajv2020({ allErrors: true }).compile(schema);
const heldOutDirectory = join(experimentRoot, 'tasks', manifest.heldOutTask);
const heldOutTask = await readJson(join(heldOutDirectory, 'task.json'));
const oracle = await readJson(join(heldOutDirectory, heldOutTask.oracle));
const fields = [
  'primaryEntity',
  'candidateEntityIds',
  'requiresDisambiguation',
  'safeNextAction',
  'reasonCode',
  'evidenceAuthority',
];

async function scoreAnswer(fileName) {
  const path = join(participantDirectory, fileName);
  const text = await readFile(path, 'utf8');
  const fileStat = await stat(path);
  const answer = JSON.parse(text);
  const schemaValid = validateAnswer(answer);
  const schemaErrors = validateAnswer.errors
    ? JSON.parse(JSON.stringify(validateAnswer.errors))
    : [];
  const fieldScores = Object.fromEntries(
    fields.map((field) => [
      field,
      stableStringify(answer[field]) === stableStringify(oracle[field]) ? 1 : 0,
    ]),
  );
  return {
    completedAt: fileStat.mtime.toISOString(),
    schemaValid,
    schemaErrors,
    exactMatch: schemaValid && Object.values(fieldScores).every(Boolean),
    fieldScores,
    normalizedScore:
      Object.values(fieldScores).reduce((sum, value) => sum + value, 0) /
      fields.length,
    outputUtf8Bytes: Buffer.byteLength(text),
    answerSha256: sha256(text),
  };
}

const initial = await scoreAnswer('answer.initial.json');
const final = await scoreAnswer('answer.final.json');
const score = {
  runId,
  sessionId: manifest.sessionId,
  condition: manifest.condition,
  phase: manifest.phase,
  model: manifest.model,
  reasoning: manifest.reasoning,
  heldOutTask: manifest.heldOutTask,
  initial,
  final,
  recoveredAfterAdaptation: !initial.exactMatch && final.exactMatch,
  scoreDelta: final.normalizedScore - initial.normalizedScore,
  observableCosts: {
    phaseOneInputUtf8Bytes: manifest.phaseOneInputBytes,
    sharedGuideUtf8Bytes: manifest.sharedGuideBytes,
    exampleGuideUtf8Bytes: manifest.exampleGuideBytes,
    phaseTwoInstructionUtf8Bytes: manifest.phaseTwoInstructionBytes,
    adaptationUtf8Bytes: manifest.adaptationBytes,
    totalExternalInputUtf8Bytes:
      manifest.phaseOneInputBytes +
      manifest.phaseTwoInstructionBytes +
      manifest.adaptationBytes,
    exactTokenUsage: null,
    observableToolCalls: null,
    phaseOneWallClockMs: Math.max(
      0,
      new Date(initial.completedAt).getTime() -
        new Date(manifest.startedAt).getTime(),
    ),
    phaseTwoWallClockMs: Math.max(
      0,
      new Date(final.completedAt).getTime() -
        new Date(manifest.phaseTwoRevealedAt).getTime(),
    ),
  },
  oracleSha256: sha256(stableStringify(oracle)),
};
const scoreText = stableStringify(score);
await writeFile(join(runDirectory, 'session-score.json'), scoreText);
console.log(scoreText);
