import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parseArgs, readJson, required, runsRoot, writeJson } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const previousRunId = required(args, 'previous-run-id');
const currentRunId = required(args, 'current-run-id');
const outputStem = String(
  args['output-stem'] ??
    `versioned-ugp-comparison-${previousRunId}-to-${currentRunId}`,
);
if (!/^[A-Za-z0-9._-]+$/.test(outputStem)) {
  throw new Error(
    'Output stem may contain only letters, digits, dots, dashes, and underscores',
  );
}
const previousRoot = join(runsRoot, previousRunId);
const currentRoot = join(runsRoot, currentRunId);

const [previousPlan, currentPlan, previousAudit, currentAudit] =
  await Promise.all([
    readJson(join(previousRoot, 'matrix-plan.json')),
    readJson(join(currentRoot, 'matrix-plan.json')),
    readJson(join(previousRoot, 'audits', 'paired-effect-audit.json')),
    readJson(join(currentRoot, 'audits', 'paired-effect-audit.json')),
  ]);

if (previousPlan.taskListDigest !== currentPlan.taskListDigest) {
  throw new Error(
    `Task-list digests differ: ${previousPlan.taskListDigest} vs ${currentPlan.taskListDigest}`,
  );
}
if (
  previousPlan.runtimeAdapter.adapterDigest ===
  currentPlan.runtimeAdapter.adapterDigest
) {
  throw new Error(
    'Adapter digests are identical; this is not a version comparison.',
  );
}

const rounded = (value) =>
  value === null || value === undefined ? null : Number(value.toFixed(6));
const metricKeys = [
  'strictSuccess',
  'officialTaskScore',
  'policyCompliant',
  'CuP',
  'steps',
  'integritySensitivityStrictSuccess',
];
const usageKeys = [
  'inputTokens',
  'outputTokens',
  'inputBytes',
  'outputBytes',
  'wallTimeMs',
];

function cell(audit, method, model) {
  const value = audit.cells.find(
    (candidate) => candidate.method === method && candidate.model === model,
  );
  if (!value)
    throw new Error(`Missing ${method}/${model} cell in ${audit.runId}`);
  return value;
}

function paired(audit, model) {
  const value = audit.pairedEffects.find(
    (candidate) => candidate.model === model,
  )?.excludingInitiallySatisfied;
  if (!value)
    throw new Error(`Missing paired effect for ${model} in ${audit.runId}`);
  return value;
}

function delta(current, previous) {
  return {
    ...Object.fromEntries(
      metricKeys.map((key) => [key, rounded(current[key] - previous[key])]),
    ),
    usage: Object.fromEntries(
      usageKeys.map((key) => [
        key,
        current.usage[key] === null || previous.usage[key] === null
          ? null
          : rounded(current.usage[key] - previous.usage[key]),
      ]),
    ),
  };
}

const models = [
  ...new Set(
    currentAudit.cells
      .filter((candidate) => candidate.method === 'ugp')
      .map((candidate) => candidate.model),
  ),
].sort();

const comparisons = models.map((model) => ({
  model,
  ugpVersionDelta: delta(
    cell(currentAudit, 'ugp', model),
    cell(previousAudit, 'ugp', model),
  ),
  htmlAxRunDrift: delta(
    cell(currentAudit, 'html-ax', model),
    cell(previousAudit, 'html-ax', model),
  ),
  withinRunPairedEffect: {
    previous: paired(previousAudit, model),
    current: paired(currentAudit, model),
    change: delta(paired(currentAudit, model), paired(previousAudit, model)),
  },
}));

const report = {
  schemaVersion: '0.3.0',
  comparisonType:
    'separate versioned descriptive comparison; no episodes or adapter digests are pooled',
  previous: {
    runId: previousRunId,
    adapter: previousPlan.runtimeAdapter,
  },
  current: {
    runId: currentRunId,
    adapter: currentPlan.runtimeAdapter,
  },
  taskListDigest: currentPlan.taskListDigest,
  caveat:
    'Model sampling is stochastic across runs. UGP version deltas are descriptive; HTML/AX run drift is reported as a negative-control context, and within-run paired effects remain the primary estimand.',
  comparisons,
};

await writeJson(join(currentRoot, 'audits', `${outputStem}.json`), report);

const lines = [
  `# SuiteCRM adapter version comparison: ${previousRunId} -> ${currentRunId}`,
  '',
  `- Previous adapter: ${previousPlan.runtimeAdapter.adapterId} (${previousPlan.runtimeAdapter.adapterDigest})`,
  `- Current adapter: ${currentPlan.runtimeAdapter.adapterId} (${currentPlan.runtimeAdapter.adapterDigest})`,
  `- Shared task-list digest: ${currentPlan.taskListDigest}`,
  '',
  'This is a separate versioned descriptive analysis. No episodes or adapter digests are pooled. Model sampling is stochastic across runs, so the within-run UGP-minus-HTML/AX paired effect remains primary; HTML/AX drift is shown as context.',
  '',
  '## Cell changes (current minus previous)',
  '',
  '| Model | Cell | ΔStrict | ΔTask | ΔPolicy | ΔCuP | ΔSteps | ΔInput tokens | ΔIntegrity strict |',
  '|---|---|---:|---:|---:|---:|---:|---:|---:|',
  ...comparisons.flatMap((comparison) =>
    [
      ['UGP', comparison.ugpVersionDelta],
      ['HTML/AX drift', comparison.htmlAxRunDrift],
    ].map(
      ([label, value]) =>
        `| ${comparison.model} | ${label} | ${value.strictSuccess} | ${value.officialTaskScore} | ${value.policyCompliant} | ${value.CuP} | ${value.steps} | ${value.usage.inputTokens} | ${value.integritySensitivityStrictSuccess} |`,
    ),
  ),
  '',
  '## Change in within-run paired UGP effect',
  '',
  '| Model | Run/effect | ΔStrict | ΔTask | ΔPolicy | ΔCuP | ΔSteps | ΔInput tokens | ΔIntegrity strict |',
  '|---|---|---:|---:|---:|---:|---:|---:|---:|',
  ...comparisons.flatMap((comparison) => [
    `| ${comparison.model} | previous UGP-HTML/AX | ${comparison.withinRunPairedEffect.previous.strictSuccess} | ${comparison.withinRunPairedEffect.previous.officialTaskScore} | ${comparison.withinRunPairedEffect.previous.policyCompliant} | ${comparison.withinRunPairedEffect.previous.CuP} | ${comparison.withinRunPairedEffect.previous.steps} | ${comparison.withinRunPairedEffect.previous.usage.inputTokens} | ${comparison.withinRunPairedEffect.previous.integritySensitivityStrictSuccess} |`,
    `| ${comparison.model} | current UGP-HTML/AX | ${comparison.withinRunPairedEffect.current.strictSuccess} | ${comparison.withinRunPairedEffect.current.officialTaskScore} | ${comparison.withinRunPairedEffect.current.policyCompliant} | ${comparison.withinRunPairedEffect.current.CuP} | ${comparison.withinRunPairedEffect.current.steps} | ${comparison.withinRunPairedEffect.current.usage.inputTokens} | ${comparison.withinRunPairedEffect.current.integritySensitivityStrictSuccess} |`,
    `| ${comparison.model} | change | ${comparison.withinRunPairedEffect.change.strictSuccess} | ${comparison.withinRunPairedEffect.change.officialTaskScore} | ${comparison.withinRunPairedEffect.change.policyCompliant} | ${comparison.withinRunPairedEffect.change.CuP} | ${comparison.withinRunPairedEffect.change.steps} | ${comparison.withinRunPairedEffect.change.usage.inputTokens} | ${comparison.withinRunPairedEffect.change.integritySensitivityStrictSuccess} |`,
  ]),
  '',
];

await writeFile(
  join(currentRoot, 'audits', `${outputStem}.md`),
  `${lines.join('\n')}\n`,
);

console.log(
  JSON.stringify({
    previousRunId,
    currentRunId,
    previousAdapterDigest: previousPlan.runtimeAdapter.adapterDigest,
    currentAdapterDigest: currentPlan.runtimeAdapter.adapterDigest,
    outputStem,
    models: models.length,
  }),
);
