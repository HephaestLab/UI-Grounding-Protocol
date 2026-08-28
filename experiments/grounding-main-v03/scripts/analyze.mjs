import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import {
  experimentRoot,
  parseArgs,
  readJson,
  required,
  runsRoot,
  writeJson,
} from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const runId = required(args, 'run-id');
const bootstrapIterations = Number(args.bootstrap ?? 10_000);
if (!Number.isInteger(bootstrapIterations) || bootstrapIterations < 100) {
  throw new Error('--bootstrap must be an integer of at least 100');
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/u);
  const header = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const values = line.split(',');
    return Object.fromEntries(
      header.map((key, index) => {
        const raw = values[index] ?? '';
        if (raw === '') return [key, null];
        return [key, JSON.parse(raw)];
      }),
    );
  });
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let output = value;
    output = Math.imul(output ^ (output >>> 15), output | 1);
    output ^= output + Math.imul(output ^ (output >>> 7), output | 61);
    return ((output ^ (output >>> 14)) >>> 0) / 4294967296;
  };
}

function quantile(sorted, probability) {
  if (sorted.length === 0) return null;
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
}

function clustersFor(rows) {
  const byTask = new Map();
  for (const row of rows) {
    const cluster = byTask.get(row.taskOpaqueId) ?? { successes: 0, n: 0 };
    cluster.successes += Number(row.strictSuccess);
    cluster.n += 1;
    byTask.set(row.taskOpaqueId, cluster);
  }
  return [...byTask.values()];
}

function bootstrapRates(clusters, iterations, random) {
  const rates = new Array(iterations);
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let successes = 0;
    let n = 0;
    for (let draw = 0; draw < clusters.length; draw += 1) {
      const cluster = clusters[Math.floor(random() * clusters.length)];
      successes += cluster.successes;
      n += cluster.n;
    }
    rates[iteration] = successes / n;
  }
  return rates;
}

const design = await readJson(join(experimentRoot, 'design.json'));
const csvPath = join(runsRoot, runId, 'episodes.csv');
const rows = parseCsv(await readFile(csvPath, 'utf8'));
const random = mulberry32(design.sampling.randomizationSeed);
const byCell = new Map();
for (const row of rows) {
  const key = `${row.groundingMethod}\t${row.model}\t${row.benchmarkId}`;
  const cell = byCell.get(key) ?? [];
  cell.push(row);
  byCell.set(key, cell);
}

const cellResults = [];
const drawsByCell = new Map();
for (const [key, cellRows] of byCell) {
  const [groundingMethod, model, benchmarkId] = key.split('\t');
  const clusters = clustersFor(cellRows);
  const draws = bootstrapRates(clusters, bootstrapIterations, random);
  const sorted = [...draws].sort((left, right) => left - right);
  drawsByCell.set(key, draws);
  const successes = cellRows.reduce(
    (sum, row) => sum + Number(row.strictSuccess),
    0,
  );
  cellResults.push({
    groundingMethod,
    model,
    benchmarkId,
    n: cellRows.length,
    taskClusters: clusters.length,
    successes,
    strictSuccessPct: (100 * successes) / cellRows.length,
    ci95: [100 * quantile(sorted, 0.025), 100 * quantile(sorted, 0.975)],
  });
}

const macroResults = [];
for (const method of design.groundingMethods) {
  for (const model of design.models) {
    const keys = design.benchmarks.map(
      (benchmark) => `${method.id}\t${model.id}\t${benchmark.id}`,
    );
    const complete = keys.every((key) => drawsByCell.has(key));
    if (!complete) {
      macroResults.push({
        groundingMethod: method.id,
        model: model.id,
        complete: false,
        macroStrictSuccessPct: null,
        ci95: null,
      });
      continue;
    }
    const draws = new Array(bootstrapIterations).fill(0);
    for (const key of keys) {
      const cellDraws = drawsByCell.get(key);
      for (let index = 0; index < bootstrapIterations; index += 1) {
        draws[index] += cellDraws[index] / keys.length;
      }
    }
    const sorted = [...draws].sort((left, right) => left - right);
    macroResults.push({
      groundingMethod: method.id,
      model: model.id,
      complete: true,
      macroStrictSuccessPct:
        (100 * draws.reduce((sum, value) => sum + value, 0)) / draws.length,
      ci95: [100 * quantile(sorted, 0.025), 100 * quantile(sorted, 0.975)],
    });
  }
}

const report = {
  schemaVersion: '0.3.0',
  runId,
  generatedAt: new Date().toISOString(),
  bootstrap: {
    iterations: bootstrapIterations,
    unit: 'taskOpaqueId cluster',
    seed: design.sampling.randomizationSeed,
  },
  cellResults,
  macroResults,
  inferentialModel: {
    status: 'run analysis/model.R only after complete confirmatory data',
    formula: design.analysis.primaryModel,
  },
};
await writeJson(join(runsRoot, runId, 'analysis.json'), report);
console.log(
  JSON.stringify({
    runId,
    cells: cellResults.length,
    completeMacros: macroResults.filter((item) => item.complete).length,
    bootstrapIterations,
  }),
);
