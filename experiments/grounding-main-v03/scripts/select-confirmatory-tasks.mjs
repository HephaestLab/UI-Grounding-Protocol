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
  join(experimentRoot, 'sampling', 'confirmatory-v1.json'),
);
assert(
  Array.isArray(plan.activeBenchmarks) && plan.activeBenchmarks.length > 0,
  'Confirmatory plan must declare activeBenchmarks',
);
assert(
  Array.isArray(plan.deferredBenchmarks),
  'Confirmatory plan must declare deferredBenchmarks',
);
assert(
  plan.activeBenchmarks.every(
    (benchmarkId) => !plan.deferredBenchmarks.includes(benchmarkId),
  ),
  'Active and deferred benchmarks overlap',
);
const calibration = await readJson(
  join(runsRoot, 'calibration', 'selection.json'),
);
const screenqaExtension = await readJson(
  join(runsRoot, 'calibration', 'extensions', 'calibration-extension-v1.json'),
);
const calibrationByBenchmark = new Map(
  calibration.selections.map((selection) => [
    selection.benchmarkId,
    new Set(selection.taskIds),
  ]),
);
calibrationByBenchmark.set(
  'st-webagentbench-cup',
  calibrationByBenchmark.get('st-webagentbench') ?? new Set(),
);
for (const taskId of screenqaExtension.taskIds) {
  calibrationByBenchmark.get('screenqa-visible').add(taskId);
}

const [screenprManifest, screenqaManifest, webmallSelection, stSelection] =
  await Promise.all([
    readJson(
      join(
        runsRoot,
        'materialized-static',
        'screenpr-referent',
        'manifest.json',
      ),
    ),
    readJson(
      join(
        runsRoot,
        'materialized-static',
        'screenqa-visible',
        'manifest.json',
      ),
    ),
    readJson(join(runsRoot, 'source-data', 'webmall', 'selection.json')),
    readJson(
      join(runsRoot, 'source-data', 'st-webagentbench', 'selection.json'),
    ),
  ]);
const sources = new Map([
  [
    'screenpr-referent',
    screenprManifest.tasks.map((task) => task.sourceTaskId),
  ],
  ['screenqa-visible', screenqaManifest.tasks.map((task) => task.sourceTaskId)],
  ['webmall-action', webmallSelection.tasks.map((task) => task.sourceTaskId)],
  ['st-webagentbench-cup', stSelection.tasks.map((task) => task.sourceTaskId)],
]);
assert(
  [...sources.keys()].every((benchmarkId) =>
    plan.activeBenchmarks.includes(benchmarkId),
  ) && plan.activeBenchmarks.every((benchmarkId) => sources.has(benchmarkId)),
  'Materialized sources do not match the active benchmark phase',
);

const selections = [];
for (const [benchmarkId, sourceTaskIds] of sources) {
  const excluded = calibrationByBenchmark.get(benchmarkId) ?? new Set();
  const taskIds = sourceTaskIds.filter((taskId) => !excluded.has(taskId));
  const benchmarkPlan = plan.benchmarks[benchmarkId];
  assert(
    taskIds.length === benchmarkPlan.expectedPrimary,
    `${benchmarkId} expected ${benchmarkPlan.expectedPrimary} primary tasks, found ${taskIds.length}`,
  );
  const robustnessTaskIds = taskIds
    .map((taskId) => ({
      taskId,
      rank: sha256(`${plan.seed}:robustness:${benchmarkId}:${taskId}`),
    }))
    .sort((left, right) => left.rank.localeCompare(right.rank))
    .slice(0, benchmarkPlan.robustnessTasks)
    .map((row) => row.taskId);
  selections.push({
    benchmarkId,
    sourcePopulation: sourceTaskIds.length,
    calibrationExcluded: excluded.size,
    taskIds,
    robustnessTaskIds,
    taskIdsDigest: sha256(canonicalJson(taskIds)),
    robustnessTaskIdsDigest: sha256(canonicalJson(robustnessTaskIds)),
  });
}
const output = {
  schemaVersion: '0.3.0',
  revision: plan.revision,
  frozenOn: plan.frozenOn,
  seed: plan.seed,
  phase: plan.phase,
  activeBenchmarks: plan.activeBenchmarks,
  selectionRule: plan.selection,
  methods: 8,
  models: 2,
  primaryTasks: selections.reduce(
    (sum, selection) => sum + selection.taskIds.length,
    0,
  ),
  primaryEpisodes: selections.reduce(
    (sum, selection) => sum + selection.taskIds.length * 8 * 2,
    0,
  ),
  additionalRobustnessEpisodes: selections.reduce(
    (sum, selection) => sum + selection.robustnessTaskIds.length * 8 * 2 * 2,
    0,
  ),
  pendingBenchmarks: plan.deferredBenchmarks,
  selections,
};
output.selectionDigest = sha256(canonicalJson(output));
await writeJson(join(runsRoot, 'confirmatory', 'selection-v1.json'), output);
for (const selection of selections) {
  await writeJson(
    join(runsRoot, 'confirmatory', 'task-ids', `${selection.benchmarkId}.json`),
    { taskIds: selection.taskIds },
  );
  await writeJson(
    join(
      runsRoot,
      'confirmatory',
      'task-ids',
      `${selection.benchmarkId}-robustness.json`,
    ),
    { taskIds: selection.robustnessTaskIds },
  );
}
const stCatalog = await readJson(
  join(
    experimentRoot,
    'vendor',
    'st-webagentbench',
    'stwebagentbench',
    'test.raw.json',
  ),
);
const stSiteByTaskId = new Map(
  stCatalog.map((task) => [`st:${task.task_id}`, task.sites?.[0]]),
);
const stConfirmatorySelection = selections.find(
  (selection) => selection.benchmarkId === 'st-webagentbench-cup',
);
assert(stConfirmatorySelection, 'ST confirmatory selection is missing');
for (const site of ['gitlab', 'shopping_admin', 'suitecrm']) {
  await writeJson(
    join(
      runsRoot,
      'confirmatory',
      'task-ids',
      `st-webagentbench-cup-${site}.json`,
    ),
    {
      taskIds: stConfirmatorySelection.taskIds.filter(
        (taskId) => stSiteByTaskId.get(taskId) === site,
      ),
    },
  );
  await writeJson(
    join(
      runsRoot,
      'confirmatory',
      'task-ids',
      `st-webagentbench-cup-${site}-robustness.json`,
    ),
    {
      taskIds: stConfirmatorySelection.robustnessTaskIds.filter(
        (taskId) => stSiteByTaskId.get(taskId) === site,
      ),
    },
  );
}
console.log(
  JSON.stringify({
    revision: output.revision,
    primaryTasks: output.primaryTasks,
    primaryEpisodes: output.primaryEpisodes,
    additionalRobustnessEpisodes: output.additionalRobustnessEpisodes,
    pendingBenchmarks: output.pendingBenchmarks,
    selectionDigest: output.selectionDigest,
  }),
);
