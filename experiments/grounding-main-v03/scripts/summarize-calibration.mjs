import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

import {
  assert,
  episodeDirectories,
  parseArgs,
  readJson,
  required,
  runsRoot,
  writeJson,
} from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const runIds = required(args, 'runs').split(',').filter(Boolean);
const outputName = String(args.output ?? 'report-v1.json');
assert(runIds.length > 0, 'At least one calibration run is required');

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
const runs = [];
for (const runId of runIds) {
  const runRoot = join(runsRoot, runId);
  const plan = await readJson(join(runRoot, 'matrix-plan.json'));
  let runRows = 0;
  if (plan.kind === 'static-matrix') {
    for (const directory of await episodeDirectories(runId)) {
      try {
        const [privateRecord, trajectory, score] = await Promise.all([
          readJson(join(directory, 'private.json')),
          readJson(join(directory, 'trajectory.json')),
          readJson(join(directory, 'score.json')),
        ]);
        rows.push({
          runId,
          benchmarkId: privateRecord.benchmarkId,
          sourceTaskId: privateRecord.sourceTaskId,
          taskFamily: privateRecord.taskFamily,
          method: trajectory.condition.groundingMethod,
          model: trajectory.condition.model,
          replicate: trajectory.condition.replicate,
          strictSuccess: score.strictSuccess,
        });
        runRows += 1;
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
  } else if (plan.kind === 'interactive-matrix') {
    const scorePaths = await walkFiles(
      join(runRoot, 'tasks'),
      'official-score.json',
    );
    for (const scorePath of scorePaths) {
      const score = await readJson(scorePath);
      rows.push({
        runId,
        benchmarkId: score.benchmarkId,
        sourceTaskId: score.sourceTaskId,
        taskFamily: score.taskFamily ?? null,
        method: score.condition.method,
        model: score.condition.model,
        replicate: score.condition.replicate,
        strictSuccess: score.strictSuccess,
        officialTaskScore:
          score.officialTaskScore ?? score.officialScore ?? null,
        policyCompliant: score.policyCompliant ?? null,
        CuP: score.CuP ?? null,
        pCuP: score.pCuP ?? null,
      });
      runRows += 1;
    }
  } else {
    throw new Error(`Unsupported matrix kind for ${runId}: ${plan.kind}`);
  }
  runs.push({
    runId,
    kind: plan.kind,
    plannedEpisodes: plan.episodeCount,
    observedEpisodes: runRows,
    complete: runRows === plan.episodeCount,
  });
}

const cellMap = new Map();
for (const row of rows) {
  const key = `${row.benchmarkId}\t${row.method}\t${row.model}`;
  const cell = cellMap.get(key) ?? { n: 0, successes: 0 };
  cell.n += 1;
  cell.successes += row.strictSuccess;
  cellMap.set(key, cell);
}
const cells = [...cellMap.entries()]
  .map(([key, cell]) => {
    const [benchmarkId, method, model] = key.split('\t');
    const strictSuccessPct = (100 * cell.successes) / cell.n;
    return {
      benchmarkId,
      method,
      model,
      ...cell,
      strictSuccessPct,
      ceiling: strictSuccessPct >= 95,
      floor: strictSuccessPct <= 5,
    };
  })
  .sort((left, right) =>
    `${left.benchmarkId}:${left.method}:${left.model}`.localeCompare(
      `${right.benchmarkId}:${right.method}:${right.model}`,
    ),
  );

const pairedMap = new Map();
for (const row of rows) {
  const key = `${row.benchmarkId}\t${row.model}\t${row.sourceTaskId}\t${row.replicate}`;
  const pair = pairedMap.get(key) ?? {
    benchmarkId: row.benchmarkId,
    model: row.model,
    sourceTaskId: row.sourceTaskId,
    replicate: row.replicate,
  };
  pair[row.method] = row.strictSuccess;
  pairedMap.set(key, pair);
}
const pairedStatsMap = new Map();
for (const pair of pairedMap.values()) {
  if (pair['vision-only'] === undefined || pair.ugp === undefined) continue;
  const key = `${pair.benchmarkId}\t${pair.model}`;
  const stats = pairedStatsMap.get(key) ?? {
    benchmarkId: pair.benchmarkId,
    model: pair.model,
    n: 0,
    controlSuccesses: 0,
    ugpSuccesses: 0,
    discordant: 0,
    ugpWins: 0,
    controlWins: 0,
  };
  stats.n += 1;
  stats.controlSuccesses += pair['vision-only'];
  stats.ugpSuccesses += pair.ugp;
  if (pair['vision-only'] !== pair.ugp) {
    stats.discordant += 1;
    if (pair.ugp > pair['vision-only']) stats.ugpWins += 1;
    else stats.controlWins += 1;
  }
  pairedStatsMap.set(key, stats);
}
const paired = [...pairedStatsMap.values()]
  .map((stats) => ({
    ...stats,
    controlRate: stats.controlSuccesses / stats.n,
    ugpRate: stats.ugpSuccesses / stats.n,
    observedEffect: (stats.ugpSuccesses - stats.controlSuccesses) / stats.n,
    discordanceRate: stats.discordant / stats.n,
    smoothedDiscordanceRate: (stats.discordant + 0.5) / (stats.n + 1),
  }))
  .sort((left, right) =>
    `${left.benchmarkId}:${left.model}`.localeCompare(
      `${right.benchmarkId}:${right.model}`,
    ),
  );

const report = {
  schemaVersion: '0.3.0',
  runIds,
  complete: runs.every((run) => run.complete),
  runs,
  observedEpisodes: rows.length,
  ceilingThresholdPct: 95,
  floorThresholdPct: 5,
  cells,
  paired,
};
await writeJson(join(runsRoot, 'calibration', outputName), report);
console.log(
  JSON.stringify({
    complete: report.complete,
    runs: runs.length,
    episodes: rows.length,
    cells: cells.length,
    ceilingCells: cells.filter((cell) => cell.ceiling).length,
    floorCells: cells.filter((cell) => cell.floor).length,
  }),
);
