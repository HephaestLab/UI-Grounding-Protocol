import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  episodeDirectories,
  parseArgs,
  readJson,
  required,
  runsRoot,
  writeJson,
} from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const runId = required(args, 'run-id');
const directories = await episodeDirectories(runId);
const rows = [];
for (const directory of directories) {
  try {
    const [trajectory, score] = await Promise.all([
      readJson(join(directory, 'trajectory.json')),
      readJson(join(directory, 'score.json')),
    ]);
    rows.push({
      episodeId: trajectory.episodeId,
      benchmarkId: trajectory.benchmarkId,
      domain: trajectory.domain,
      taskFamily: trajectory.taskFamily,
      taskOpaqueId: trajectory.taskOpaqueId,
      groundingMethod: trajectory.condition.groundingMethod,
      model: trajectory.condition.model,
      replicate: trajectory.condition.replicate,
      strictSuccess: score.strictSuccess,
      inputBytes: trajectory.usage.inputBytes,
      outputBytes: trajectory.usage.outputBytes,
      wallTimeMs: trajectory.usage.wallTimeMs,
      inputTokens: trajectory.usage.inputTokens,
      outputTokens: trajectory.usage.outputTokens,
    });
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

const groups = new Map();
for (const row of rows) {
  const key = `${row.groundingMethod}\t${row.model}\t${row.benchmarkId}`;
  const group = groups.get(key) ?? { n: 0, successes: 0 };
  group.n += 1;
  group.successes += row.strictSuccess;
  groups.set(key, group);
}
const cells = [...groups.entries()].map(([key, value]) => {
  const [groundingMethod, model, benchmarkId] = key.split('\t');
  return {
    groundingMethod,
    model,
    benchmarkId,
    n: value.n,
    successes: value.successes,
    strictSuccessPct: (100 * value.successes) / value.n,
  };
});
cells.sort((a, b) =>
  `${a.groundingMethod}:${a.model}:${a.benchmarkId}`.localeCompare(
    `${b.groundingMethod}:${b.model}:${b.benchmarkId}`,
  ),
);

const report = {
  schemaVersion: '0.3.0',
  runId,
  episodesScored: rows.length,
  cells,
};
const outputRoot = join(runsRoot, runId);
await writeJson(join(outputRoot, 'summary.json'), report);
const csvHeader = [
  'episodeId',
  'benchmarkId',
  'domain',
  'taskFamily',
  'taskOpaqueId',
  'groundingMethod',
  'model',
  'replicate',
  'strictSuccess',
  'inputBytes',
  'outputBytes',
  'wallTimeMs',
  'inputTokens',
  'outputTokens',
];
const csv = [
  csvHeader.join(','),
  ...rows.map((row) =>
    csvHeader
      .map((key) => {
        const value = row[key];
        return value === null ? '' : JSON.stringify(value);
      })
      .join(','),
  ),
].join('\n');
await writeFile(join(outputRoot, 'episodes.csv'), `${csv}\n`);
console.log(
  JSON.stringify({ runId, episodesScored: rows.length, cells: cells.length }),
);
