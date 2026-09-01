import { join } from 'node:path';

import {
  experimentRoot,
  parseArgs,
  readJson,
  resolveInput,
  sha256,
  writeJson,
} from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const seed = Number(args.seed ?? 240902);
const outputPath = resolveInput(
  String(
    args.output ??
      join(experimentRoot, 'sampling', 'suitecrm-paired-pilot-v2.json'),
  ),
);
if (!Number.isInteger(seed)) throw new Error('--seed must be an integer');
const tasks = await readJson(
  join(
    experimentRoot,
    'vendor',
    'st-webagentbench',
    'stwebagentbench',
    'test.raw.json',
  ),
);
const supported = tasks.filter(
  (task) =>
    task.sites?.[0] === 'suitecrm' &&
    (!task.setup_scripts || task.setup_scripts.length === 0) &&
    Number(task.intent_template_id) >= 2000 &&
    Number(task.intent_template_id) <= 3019,
);
const legacy = supported
  .filter((task) => Number(task.intent_template_id) < 3000)
  .sort((left, right) => left.task_id - right.task_id);
const advancedGroups = Map.groupBy(
  supported.filter((task) => Number(task.intent_template_id) >= 3000),
  (task) => Number(task.intent_template_id),
);
const advanced = [...advancedGroups.entries()]
  .sort(([left], [right]) => left - right)
  .map(
    ([templateId, candidates]) =>
      [...candidates].sort((left, right) =>
        sha256(`${seed}:${templateId}:${left.task_id}`).localeCompare(
          sha256(`${seed}:${templateId}:${right.task_id}`),
        ),
      )[0],
  );
const selected = [...legacy, ...advanced];
if (legacy.length !== 30 || advanced.length !== 20 || selected.length !== 50)
  throw new Error(
    `Unexpected supported slice: ${legacy.length} legacy + ${advanced.length} advanced`,
  );
const output = {
  schemaVersion: '0.3.0',
  revision: 'suitecrm-paired-pilot-v2',
  frozenOn: new Date().toISOString().slice(0, 10),
  seed,
  benchmarkId: 'st-webagentbench-cup',
  site: 'suitecrm',
  taskCount: selected.length,
  episodeDesign: {
    methods: ['html-ax', 'ugp'],
    models: ['gpt-5.6-luna', 'gpt-5.4'],
    replicates: [1],
    episodeCount: selected.length * 2 * 2,
  },
  supportRule: {
    included:
      'Application-owned SuiteCRM workflows with intent template IDs 2000-3019 and no benchmark setup script.',
    excluded:
      'Synthetic benchmark-injected visual surfaces and answer-only modality tasks are outside this application semantic-sidecar treatment and are reported as N/A, not failures.',
    advancedStratification:
      'All 30 legacy workflows plus one seeded variant from each of 20 advanced workflow templates.',
  },
  taskIds: selected.map((task) => `st:${task.task_id}`),
  strata: selected.map((task) => ({
    sourceTaskId: `st:${task.task_id}`,
    intentTemplateId: task.intent_template_id,
    difficultyTier: task.task_metadata?.difficulty_tier ?? 'legacy',
    policyCount: task.policies?.length ?? 0,
  })),
};
await writeJson(outputPath, output);
console.log(JSON.stringify({ outputPath, ...output }));
