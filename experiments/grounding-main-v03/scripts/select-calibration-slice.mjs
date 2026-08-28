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
  join(experimentRoot, 'sampling', 'calibration.json'),
);

function proportionalQuotas(groups, total) {
  const population = [...groups.values()].reduce(
    (sum, items) => sum + items.length,
    0,
  );
  const coverNonempty = groups.size <= total;
  const rows = [...groups.entries()].map(([stratum, items]) => {
    const exact = (items.length * total) / population;
    return {
      stratum,
      population: items.length,
      quota: coverNonempty ? 1 : 0,
      exact,
      remainder: Number((exact - Math.floor(exact)).toFixed(12)),
    };
  });
  let remaining = total - rows.reduce((sum, row) => sum + row.quota, 0);
  while (remaining > 0) {
    const row = [...rows]
      .filter((candidate) => candidate.quota < candidate.population)
      .sort(
        (left, right) =>
          right.exact - right.quota - (left.exact - left.quota) ||
          left.stratum.localeCompare(right.stratum),
      )[0];
    assert(row, 'No calibration stratum has remaining capacity');
    row.quota += 1;
    remaining -= 1;
  }
  assert(remaining === 0, 'Could not allocate calibration quotas');
  return rows.map(({ stratum, population: count, quota, remainder }) => ({
    stratum,
    population: count,
    quota,
    remainder,
  }));
}

function select(candidates, benchmarkId) {
  const groups = new Map();
  for (const candidate of candidates) {
    const items = groups.get(candidate.stratum) ?? [];
    items.push(candidate);
    groups.set(candidate.stratum, items);
  }
  const quotas = proportionalQuotas(groups, plan.tasksPerBenchmark);
  const selected = quotas
    .flatMap(({ stratum, quota }) =>
      groups
        .get(stratum)
        .map((candidate) => ({
          ...candidate,
          rank: sha256(
            `${plan.seed}:calibration:${benchmarkId}:${candidate.sourceTaskId}`,
          ),
        }))
        .sort((left, right) => left.rank.localeCompare(right.rank))
        .slice(0, quota),
    )
    .sort((left, right) => left.rank.localeCompare(right.rank));
  assert(
    selected.length === plan.tasksPerBenchmark,
    `${benchmarkId} selected ${selected.length} calibration tasks`,
  );
  return {
    benchmarkId,
    quotas,
    taskIds: selected.map((candidate) => candidate.sourceTaskId),
    tasks: selected.map(({ sourceTaskId, stratum, rank }) => ({
      sourceTaskId,
      stratum,
      rank,
    })),
  };
}

const staticCandidates = [];
for (const directory of ['screenpr-referent', 'screenqa-visible']) {
  const manifest = await readJson(
    join(runsRoot, 'materialized-static', directory, 'manifest.json'),
  );
  const candidates = await Promise.all(
    manifest.tasks.map(async (row) => {
      const task = await readJson(row.taskPath);
      return {
        sourceTaskId: row.sourceTaskId,
        stratum:
          directory === 'screenpr-referent' ? task.domain : task.taskFamily,
      };
    }),
  );
  staticCandidates.push(select(candidates, manifest.benchmarkId));
}

const webmallSelection = await readJson(
  join(runsRoot, 'source-data', 'webmall', 'selection.json'),
);
const stSelection = await readJson(
  join(runsRoot, 'source-data', 'st-webagentbench', 'selection.json'),
);
const selections = [
  ...staticCandidates,
  select(
    webmallSelection.tasks.map((task) => ({
      sourceTaskId: task.sourceTaskId,
      stratum: task.category,
    })),
    webmallSelection.benchmarkId,
  ),
  select(
    stSelection.tasks.map((task) => ({
      sourceTaskId: task.sourceTaskId,
      stratum: `${task.site}:${task.policyCountBand}`,
    })),
    stSelection.benchmarkId,
  ),
];

const output = {
  schemaVersion: '0.3.0',
  seed: plan.seed,
  selectionRule: plan.selection,
  exclusionRule: plan.exclusion,
  methods: plan.methods,
  models: plan.models,
  tasksPerBenchmark: plan.tasksPerBenchmark,
  plannedEpisodes:
    selections.length *
    plan.tasksPerBenchmark *
    plan.methods.length *
    plan.models.length,
  selections,
  selectionDigest: sha256(canonicalJson(selections)),
};
await writeJson(join(runsRoot, 'calibration', 'selection.json'), output);
for (const selection of selections) {
  await writeJson(
    join(runsRoot, 'calibration', 'task-ids', `${selection.benchmarkId}.json`),
    { taskIds: selection.taskIds },
  );
}
console.log(JSON.stringify(output));
