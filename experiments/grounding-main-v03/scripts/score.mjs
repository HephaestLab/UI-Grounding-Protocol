import { dirname, join } from 'node:path';

import {
  assert,
  canonicalJson,
  normalizeAnswer,
  normalizeScreenqaAnswer,
  parseArgs,
  readJson,
  required,
  resolveInput,
  schemaValidators,
  sha256,
  validateOrThrow,
  writeJson,
} from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const trajectoryPath = resolveInput(required(args, 'trajectory'));
const goldPath = resolveInput(required(args, 'gold'));
const episodeRoot = dirname(trajectoryPath);
const [trajectory, gold, privateRecord, validators] = await Promise.all([
  readJson(trajectoryPath),
  readJson(goldPath),
  readJson(join(episodeRoot, 'private.json')),
  schemaValidators(),
]);

validateOrThrow(validators['trajectory.schema.json'], trajectory, 'trajectory');
validateOrThrow(validators['gold.schema.json'], gold, 'gold key');
assert(
  gold.taskId === privateRecord.sourceTaskId,
  'Gold key does not match the sealed task',
);

let strictSuccess = 0;
let details;
if (trajectory.validation.valid) {
  const output = trajectory.response.output;
  if (gold.scorer.kind === 'normalized-exact-answer') {
    const actual =
      output.kind === 'answer' ? normalizeAnswer(output.answer) : null;
    const accepted = gold.scorer.accepted.map(normalizeAnswer);
    strictSuccess = actual !== null && accepted.includes(actual) ? 1 : 0;
    details = { validAction: true, acceptedCount: accepted.length };
  } else if (gold.scorer.kind === 'screenqa-sqa-s-exact') {
    const actual =
      output.kind === 'answer' ? normalizeScreenqaAnswer(output.answer) : null;
    const accepted = gold.scorer.accepted.map(normalizeScreenqaAnswer);
    strictSuccess = actual !== null && accepted.includes(actual) ? 1 : 0;
    details = {
      validAction: true,
      acceptedCount: accepted.length,
      officialMetric: 'SQA-S Exact Match',
    };
  } else if (gold.scorer.kind === 'exact-action') {
    strictSuccess =
      canonicalJson(output) === canonicalJson(gold.scorer.expected) ? 1 : 0;
    details = { validAction: true };
  } else {
    throw new Error(
      'External official scorers must run inside the benchmark adapter and supply a sealed deterministic result; this local scorer will not execute commands from an answer-key file.',
    );
  }
} else {
  details = {
    validAction: false,
    validationErrors: trajectory.validation.errors,
  };
}

const score = {
  schemaVersion: '0.3.0',
  episodeId: trajectory.episodeId,
  strictSuccess,
  scorerKind: gold.scorer.kind,
  details,
  trajectoryDigest: sha256(canonicalJson(trajectory)),
  goldDigest: sha256(canonicalJson(gold)),
  scoredAt: new Date().toISOString(),
};
validateOrThrow(validators['score.schema.json'], score, 'score');
await writeJson(join(episodeRoot, 'score.json'), score);
console.log(JSON.stringify({ episodeId: score.episodeId, strictSuccess }));
