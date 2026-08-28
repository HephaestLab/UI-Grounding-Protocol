import { join } from 'node:path';

import {
  assert,
  canonicalJson,
  experimentRoot,
  readJson,
  runsRoot,
  sha256,
  writeJson,
} from './lib.mjs';

const plan = await readJson(
  join(experimentRoot, 'sampling', 'calibration-extension-v1.json'),
);
const original = await readJson(
  join(runsRoot, 'calibration', 'task-ids', 'screenqa-visible.json'),
);
const manifest = await readJson(
  join(runsRoot, 'materialized-static', 'screenqa-visible', 'manifest.json'),
);
const excluded = new Set(original.taskIds);
const candidates = [];
for (const row of manifest.tasks) {
  if (excluded.has(row.sourceTaskId)) continue;
  const task = await readJson(row.taskPath);
  candidates.push({
    sourceTaskId: row.sourceTaskId,
    stratum: task.taskFamily,
  });
}

const groups = new Map();
for (const candidate of candidates) {
  const group = groups.get(candidate.stratum) ?? [];
  group.push({
    ...candidate,
    rank: sha256(`${plan.seed}:${plan.revision}:${candidate.sourceTaskId}`),
  });
  groups.set(candidate.stratum, group);
}
const population = candidates.length;
const quotas = [...groups.entries()].map(([stratum, items]) => ({
  stratum,
  population: items.length,
  exact: (items.length * plan.additionalTasks) / population,
  quota: 1,
}));
let remaining =
  plan.additionalTasks - quotas.reduce((sum, row) => sum + row.quota, 0);
while (remaining > 0) {
  const row = [...quotas]
    .filter((candidate) => candidate.quota < candidate.population)
    .sort(
      (left, right) =>
        right.exact - right.quota - (left.exact - left.quota) ||
        left.stratum.localeCompare(right.stratum),
    )[0];
  assert(row, 'No ScreenQA extension stratum has remaining capacity');
  row.quota += 1;
  remaining -= 1;
}
const selected = quotas
  .flatMap(({ stratum, quota }) =>
    groups
      .get(stratum)
      .sort((left, right) => left.rank.localeCompare(right.rank))
      .slice(0, quota),
  )
  .sort((left, right) => left.rank.localeCompare(right.rank));
assert(
  selected.length === plan.additionalTasks,
  `Expected ${plan.additionalTasks} extension tasks, found ${selected.length}`,
);
assert(
  selected.every((task) => !excluded.has(task.sourceTaskId)),
  'Extension overlaps the original calibration slice',
);

const output = {
  schemaVersion: '0.3.0',
  revision: plan.revision,
  benchmarkId: plan.benchmarkId,
  seed: plan.seed,
  selectionRule: plan.decision,
  exclusionRule: plan.exclusion,
  originalTaskIds: original.taskIds,
  taskIds: selected.map((task) => task.sourceTaskId),
  combinedTaskIds: [
    ...original.taskIds,
    ...selected.map((task) => task.sourceTaskId),
  ],
  quotas: quotas.map(({ stratum, population: count, quota }) => ({
    stratum,
    population: count,
    quota,
  })),
  tasks: selected,
};
output.selectionDigest = sha256(canonicalJson(output));
await writeJson(
  join(runsRoot, 'calibration', 'extensions', `${plan.revision}.json`),
  output,
);
await writeJson(
  join(
    runsRoot,
    'calibration',
    'task-ids',
    'screenqa-visible-extension-v1.json',
  ),
  { taskIds: output.taskIds },
);
await writeJson(
  join(
    runsRoot,
    'calibration',
    'task-ids',
    'screenqa-visible-combined-v1.json',
  ),
  { taskIds: output.combinedTaskIds },
);
console.log(JSON.stringify(output));
