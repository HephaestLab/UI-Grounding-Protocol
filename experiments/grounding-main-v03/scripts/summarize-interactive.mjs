import { readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  parseArgs,
  readJson,
  required,
  runsRoot,
  sha256,
  writeJson,
} from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const runId = required(args, 'run-id');
const runRoot = join(runsRoot, runId);

async function walkFiles(root, name) {
  const output = [];
  async function visit(directory) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.name === name) output.push(path);
    }
  }
  await visit(root);
  return output;
}

const rows = [];
for (const scorePath of await walkFiles(
  join(runRoot, 'tasks'),
  'official-score.json',
)) {
  const score = await readJson(scorePath);
  const trajectories = await Promise.all(
    score.episodeIds.map((episodeId) =>
      readJson(join(runRoot, 'episodes', episodeId, 'trajectory.json')),
    ),
  );
  const sum = (key) =>
    trajectories.reduce((total, trajectory) => {
      const value = trajectory.usage[key];
      return value === null || total === null ? null : total + value;
    }, 0);
  rows.push({
    episodeId: sha256(
      `${runId}:${score.sourceTaskId}:${score.condition.method}:${score.condition.model}:${score.condition.replicate}`,
    ).slice(0, 24),
    benchmarkId: score.benchmarkId,
    domain: score.domain ?? 'unknown',
    taskFamily: score.taskFamily ?? 'unknown',
    taskOpaqueId: sha256(`task:${score.sourceTaskId}`).slice(0, 24),
    groundingMethod: score.condition.method,
    model: score.condition.model,
    replicate: score.condition.replicate,
    strictSuccess: score.strictSuccess,
    nativeBenchmarkScore:
      score.officialTaskScore ?? score.officialScore ?? null,
    policyCompliant: score.policyCompliant ?? null,
    CuP: score.CuP ?? null,
    pCuP: score.pCuP ?? null,
    steps: score.steps,
    inputBytes: sum('inputBytes'),
    outputBytes: sum('outputBytes'),
    wallTimeMs: sum('wallTimeMs'),
    inputTokens: sum('inputTokens'),
    outputTokens: sum('outputTokens'),
  });
}
rows.sort((left, right) => left.episodeId.localeCompare(right.episodeId));

const groups = new Map();
for (const row of rows) {
  const key = `${row.groundingMethod}\t${row.model}\t${row.benchmarkId}`;
  const group = groups.get(key) ?? { n: 0, successes: 0 };
  group.n += 1;
  group.successes += row.strictSuccess;
  groups.set(key, group);
}
const cells = [...groups.entries()]
  .map(([key, value]) => {
    const [groundingMethod, model, benchmarkId] = key.split('\t');
    return {
      groundingMethod,
      model,
      benchmarkId,
      ...value,
      strictSuccessPct: (100 * value.successes) / value.n,
    };
  })
  .sort((left, right) =>
    `${left.groundingMethod}:${left.model}:${left.benchmarkId}`.localeCompare(
      `${right.groundingMethod}:${right.model}:${right.benchmarkId}`,
    ),
  );
await writeJson(join(runRoot, 'summary.json'), {
  schemaVersion: '0.3.0',
  runId,
  tasksScored: rows.length,
  cells,
});
await writeJson(join(runRoot, 'episodes.json'), rows);
const header = Object.keys(
  rows[0] ?? {
    episodeId: null,
    benchmarkId: null,
    domain: null,
    taskFamily: null,
    taskOpaqueId: null,
    groundingMethod: null,
    model: null,
    replicate: null,
    strictSuccess: null,
  },
);
const csv = [
  header.join(','),
  ...rows.map((row) =>
    header
      .map((key) => (row[key] === null ? '' : JSON.stringify(row[key])))
      .join(','),
  ),
].join('\n');
await writeFile(join(runRoot, 'episodes.csv'), `${csv}\n`);
console.log(
  JSON.stringify({ runId, tasksScored: rows.length, cells: cells.length }),
);
