import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  assert,
  parseArgs,
  readJson,
  required,
  runsRoot,
  writeJson,
} from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const runIds = required(args, 'runs').split(',').filter(Boolean);
const outputRunId = required(args, 'output-run-id');
assert(runIds.length > 0, 'At least one input run is required');
assert(
  /^[A-Za-z0-9._-]+$/u.test(outputRunId),
  '--output-run-id contains unsafe characters',
);
const rows = (
  await Promise.all(
    runIds.map((runId) => readJson(join(runsRoot, runId, 'episodes.json'))),
  )
).flat();
const episodeIds = new Set(rows.map((row) => row.episodeId));
assert(
  episodeIds.size === rows.length,
  'Input runs contain duplicate episode IDs',
);
const outputRoot = join(runsRoot, outputRunId);
await mkdir(outputRoot, { recursive: true });
await writeJson(join(outputRoot, 'episodes.json'), rows);
const preferredHeader = [
  'episodeId',
  'benchmarkId',
  'domain',
  'taskFamily',
  'taskOpaqueId',
  'groundingMethod',
  'model',
  'replicate',
  'strictSuccess',
  'nativeBenchmarkScore',
  'policyCompliant',
  'CuP',
  'pCuP',
  'steps',
  'inputBytes',
  'outputBytes',
  'wallTimeMs',
  'inputTokens',
  'outputTokens',
];
const observedKeys = new Set(rows.flatMap((row) => Object.keys(row)));
const header = [
  ...preferredHeader.filter((key) => observedKeys.has(key)),
  ...[...observedKeys].filter((key) => !preferredHeader.includes(key)).sort(),
];
const csv = [
  header.join(','),
  ...rows.map((row) =>
    header
      .map((key) => {
        const value = row[key];
        return value === null || value === undefined
          ? ''
          : JSON.stringify(value);
      })
      .join(','),
  ),
].join('\n');
await writeFile(join(outputRoot, 'episodes.csv'), `${csv}\n`);
await writeJson(join(outputRoot, 'sources.json'), {
  schemaVersion: '0.3.0',
  outputRunId,
  inputRunIds: runIds,
  episodes: rows.length,
});
console.log(
  JSON.stringify({
    outputRunId,
    inputRuns: runIds.length,
    episodes: rows.length,
  }),
);
