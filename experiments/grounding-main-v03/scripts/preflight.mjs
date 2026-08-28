import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { format } from 'prettier';

import {
  experimentRoot,
  readJson,
  runsRoot,
  stableStringify,
  writeJson,
} from './lib.mjs';

function runScript(name, args = []) {
  const path = join(experimentRoot, 'scripts', name);
  const result = spawnSync(process.execPath, [path, ...args], {
    cwd: experimentRoot,
    encoding: 'utf8',
    timeout: 60_000,
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error(`${name} failed:\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout.trim();
}

async function optionalJson(path) {
  try {
    return await readJson(path);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

runScript('validate.mjs');
runScript('doctor.mjs');
runScript('vendor-check.mjs');

const smokeRunId = 'preflight-fixture';
const prepared = JSON.parse(
  runScript('prepare.mjs', [
    '--task',
    join(experimentRoot, 'fixtures', 'tasks', 'bi-kpi-qa.json'),
    '--method',
    'ugp',
    '--model',
    'gpt-5.6-luna',
    '--run-id',
    smokeRunId,
  ]),
);
const episodeRoot = join(runsRoot, smokeRunId, 'episodes', prepared.episodeId);
runScript('record.mjs', [
  '--request',
  join(episodeRoot, 'request.json'),
  '--response',
  join(experimentRoot, 'fixtures', 'responses', 'bi-kpi-correct.json'),
]);
const smokeScore = JSON.parse(
  runScript('score.mjs', [
    '--trajectory',
    join(episodeRoot, 'trajectory.json'),
    '--gold',
    join(experimentRoot, 'fixtures', 'gold', 'bi-kpi-qa.gold.json'),
  ]),
);
runScript('summarize.mjs', ['--run-id', smokeRunId]);
const smokeAnalysis = JSON.parse(
  runScript('analyze.mjs', ['--run-id', smokeRunId, '--bootstrap', '100']),
);

const [design, manifest, adapters, environment, vendor, confirmatoryPlan] =
  await Promise.all([
    readJson(join(experimentRoot, 'design.json')),
    readJson(join(experimentRoot, 'benchmark-manifest.json')),
    readJson(join(experimentRoot, 'benchmark-adapters.json')),
    readJson(join(runsRoot, 'preflight', 'environment.json')),
    readJson(join(runsRoot, 'preflight', 'vendor-check.json')),
    readJson(join(experimentRoot, 'sampling', 'confirmatory-v1.json')),
  ]);
const [confirmatorySelection, calibration, power, staticAudit] =
  await Promise.all([
    optionalJson(join(runsRoot, 'confirmatory', 'selection-v1.json')),
    optionalJson(join(runsRoot, 'calibration', 'report-v1.json')),
    optionalJson(join(runsRoot, 'power', 'power-v1.json')),
    optionalJson(join(runsRoot, 'audits', 'static-materialization.json')),
  ]);
const activeBenchmarkIds = new Set(confirmatoryPlan.activeBenchmarks ?? []);
const activeAdapters = adapters.adapters.filter((adapter) =>
  activeBenchmarkIds.has(adapter.benchmarkId),
);
const calibrationAudits = calibration
  ? await Promise.all(
      calibration.runIds.map((runId) =>
        optionalJson(join(runsRoot, runId, 'audits', 'fact-parity.json')),
      ),
    )
  : [];
const calibrationCoverage =
  calibration?.complete === true &&
  [...activeBenchmarkIds].every((benchmarkId) =>
    design.models.every((model) =>
      calibration.paired.some(
        (row) => row.benchmarkId === benchmarkId && row.model === model.id,
      ),
    ),
  );
const calibrationAuditsPass =
  calibrationCoverage &&
  calibrationAudits.length === calibration.runIds.length &&
  calibrationAudits.every(
    (audit) =>
      audit?.valid === true &&
      audit.scoredJobs > 0 &&
      audit.actorPackets > 0 &&
      audit.failures.length === 0,
  );
const calibrationBoundaryChecksPass =
  calibrationAuditsPass &&
  calibrationAudits.every(
    (audit) =>
      audit.actorIsolationChecks > 0 &&
      audit.runnerIdentityChecks > 0 &&
      audit.multimodalTransportChecks > 0 &&
      audit.transcriptIntegrityChecks > 0,
  );
const affectedCalibrationBenchmarks = new Set(
  (calibration?.cells ?? [])
    .filter((cell) => cell.ceiling || cell.floor)
    .map((cell) => cell.benchmarkId),
);
const calibrationDecisions = confirmatoryPlan.calibrationDecisions ?? {};
const calibrationReviewed =
  calibrationCoverage &&
  [...affectedCalibrationBenchmarks].every(
    (benchmarkId) =>
      typeof calibrationDecisions[benchmarkId] === 'string' &&
      calibrationDecisions[benchmarkId].length > 0,
  );
const selectionIsFullEligiblePopulation =
  confirmatorySelection?.phase === confirmatoryPlan.phase &&
  [...activeBenchmarkIds].every((benchmarkId) => {
    const selection = confirmatorySelection.selections.find(
      (row) => row.benchmarkId === benchmarkId,
    );
    return (
      selection &&
      selection.taskIds.length ===
        selection.sourcePopulation - selection.calibrationExcluded
    );
  });
const underpoweredBenchmarks = new Set(
  (power?.cells ?? [])
    .filter((cell) => !cell.passes)
    .map((cell) => cell.benchmarkId),
);
const powerDecisions = confirmatoryPlan.powerDecisions ?? {};
const powerDecisionRecorded = (key) =>
  typeof powerDecisions[key] === 'string' && powerDecisions[key].length > 0;
const powerCoverage =
  power?.phase === confirmatoryPlan.phase &&
  power.missingActiveBenchmarks?.length === 0 &&
  [...activeBenchmarkIds].every((benchmarkId) =>
    design.models.every((model) =>
      power.cells.some(
        (cell) => cell.benchmarkId === benchmarkId && cell.model === model.id,
      ),
    ),
  );
const sampleSizeJustified =
  powerCoverage &&
  selectionIsFullEligiblePopulation &&
  (power.pooled.referent.passes === true ||
    powerDecisionRecorded('pooled-referent')) &&
  (power.pooled.action.passes === true ||
    powerDecisionRecorded('pooled-action')) &&
  [...underpoweredBenchmarks].every(powerDecisionRecorded);
const fourBenchmarkAccessApproved =
  typeof confirmatoryPlan.localResearchExecutionApprovedOn === 'string' &&
  activeBenchmarkIds.size === 4 &&
  confirmatoryPlan.deferredBenchmarks?.includes('workarena-plus-plus');

const gates = {
  designFrozenBeforeOutcomes: design.status === 'frozen-for-preflight',
  schemasAndMatrixValid: true,
  benchmarkVersionsPinned: manifest.sources
    .filter((item) => item.repository)
    .every((item) => /^[a-f0-9]{40}$/u.test(item.commit)),
  officialEntrypointsManifested: manifest.sources.every(
    (item) => item.repository || item.dataset || item.projectUrl,
  ),
  benchmarkAdapterContractsComplete: activeAdapters.every(
    (item) => item.harnessContractReady,
  ),
  sourceIntegrationsReady:
    activeAdapters.length === activeBenchmarkIds.size &&
    calibrationCoverage &&
    staticAudit?.valid === true,
  localLifecycleSmokePasses:
    smokeScore.strictSuccess === 1 && smokeAnalysis.cells === 1,
  deterministicHiddenScorers: calibrationAuditsPass,
  factParityAudited:
    calibrationAuditsPass &&
    calibrationAudits.every((audit) => audit.methodFactParityChecks > 0) &&
    staticAudit?.valid === true,
  licenseAndTermsApproved: fourBenchmarkAccessApproved,
  calibrationHasNoCeilingOrFloor: calibrationReviewed,
  sampleSizeJustified,
  publicRepositoriesLocallyPinned: vendor.records.every(
    (item) => item.localMatchesPin,
  ),
  baseToolchain: environment.gates.baseToolchain,
  benchmarkRuntimeReady:
    environment.gates.webMallPythonCompatible &&
    environment.gates.containerRuntime &&
    environment.gates.linuxContainerHost &&
    environment.gates.stWebAgentBenchExternalAccess &&
    calibrationCoverage,
  actorFilesystemAndToolsIsolated: calibrationBoundaryChecksPass,
  multimodalActorTransportVerified: calibrationBoundaryChecksPass,
  exactRunnerIdentityRecorded: calibrationBoundaryChecksPass,
  nativeBaselineSmokeTestsPass: calibrationAuditsPass,
};

const pilotGateNames = [
  'designFrozenBeforeOutcomes',
  'schemasAndMatrixValid',
  'benchmarkVersionsPinned',
  'officialEntrypointsManifested',
  'benchmarkAdapterContractsComplete',
  'localLifecycleSmokePasses',
  'baseToolchain',
];
const confirmatoryGateNames = [
  ...pilotGateNames,
  'sourceIntegrationsReady',
  'deterministicHiddenScorers',
  'factParityAudited',
  'licenseAndTermsApproved',
  'calibrationHasNoCeilingOrFloor',
  'sampleSizeJustified',
  'publicRepositoriesLocallyPinned',
  'benchmarkRuntimeReady',
  'actorFilesystemAndToolsIsolated',
  'multimodalActorTransportVerified',
  'exactRunnerIdentityRecorded',
  'nativeBaselineSmokeTestsPass',
];
const falseGates = Object.entries(gates)
  .filter(([, passed]) => !passed)
  .map(([name]) => name);
const readiness = {
  schemaVersion: '0.3.0',
  generatedAt: new Date().toISOString(),
  branch: 'experiment/grounding-main-v03',
  phase: confirmatoryPlan.phase,
  activeBenchmarks: [...activeBenchmarkIds],
  deferredBenchmarks: confirmatoryPlan.deferredBenchmarks,
  pilotHarnessRunnable: pilotGateNames.every((name) => gates[name]),
  mainTablePilotRunnable:
    pilotGateNames.every((name) => gates[name]) &&
    gates.sourceIntegrationsReady &&
    gates.multimodalActorTransportVerified,
  confirmatoryExperimentRunnable: confirmatoryGateNames.every(
    (name) => gates[name],
  ),
  gates,
  falseGates,
  evidence: {
    confirmatorySelectionDigest: confirmatorySelection?.selectionDigest ?? null,
    calibrationRunIds: calibration?.runIds ?? [],
    calibrationAudits: calibrationAudits.filter(Boolean).length,
    calibrationComplete: calibration?.complete ?? false,
    powerPhase: power?.phase ?? null,
    missingActiveBenchmarks: power?.missingActiveBenchmarks ?? [],
    staticMaterializationValid: staticAudit?.valid ?? false,
  },
  blockers: [
    {
      id: 'external-benchmark-environments',
      affects: [
        'sourceIntegrationsReady',
        'benchmarkRuntimeReady',
        'nativeBaselineSmokeTestsPass',
      ],
      resolution:
        'Provision the pinned benchmark repositories, compatible Python/browser/container stacks, approved gated datasets, and required web services; then run one official native smoke task per source.',
    },
    {
      id: 'representation-fact-parity',
      affects: ['factParityAudited'],
      resolution:
        'Materialize every grounding representation from the same frozen source-fact inventory, run the cross-method parity audit, and record any method-specific information loss.',
    },
    {
      id: 'license-and-terms-review',
      affects: ['licenseAndTermsApproved'],
      resolution:
        'Record dataset/code licenses, redistribution limits, gated terms, and institutional approval before materialization or release.',
    },
    {
      id: 'hidden-scoring-and-actor-isolation',
      affects: [
        'deterministicHiddenScorers',
        'actorFilesystemAndToolsIsolated',
        'multimodalActorTransportVerified',
        'exactRunnerIdentityRecorded',
      ],
      resolution:
        'Run the actor in a process/tool sandbox that cannot read task IDs, gold, scorers, filesystem, or network; provide native image payloads without filesystem tools; retain an independent runner transcript. Codex subagent prompts alone do not close these gates.',
    },
    {
      id: 'calibration',
      affects: ['calibrationHasNoCeilingOrFloor', 'sampleSizeJustified'],
      resolution:
        'Run only the registered calibration slice, inspect per-stratum success without confirmatory outcomes, run the registered simulation/power analysis, and freeze any difficulty/sampling adjustment before the main run.',
    },
    {
      id: 'public-source-checkouts',
      affects: ['publicRepositoriesLocallyPinned'],
      resolution:
        'Check out each public source at the exact manifest commit in the ignored vendor directory or an equivalent immutable experiment image.',
    },
  ],
};
readiness.blockers = readiness.blockers.filter((blocker) =>
  blocker.affects.some((gate) => gates[gate] === false),
);
const readinessText = await format(stableStringify(readiness), {
  parser: 'json',
});
await Promise.all([
  writeFile(join(experimentRoot, 'readiness.json'), readinessText),
  writeJson(join(runsRoot, 'preflight', 'readiness.json'), readiness),
]);
console.log(
  JSON.stringify({
    pilotHarnessRunnable: readiness.pilotHarnessRunnable,
    mainTablePilotRunnable: readiness.mainTablePilotRunnable,
    confirmatoryExperimentRunnable: readiness.confirmatoryExperimentRunnable,
    passed: Object.keys(gates).length - falseGates.length,
    total: Object.keys(gates).length,
    falseGates,
  }),
);
