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

const [design, manifest, adapters, environment, vendor] = await Promise.all([
  readJson(join(experimentRoot, 'design.json')),
  readJson(join(experimentRoot, 'benchmark-manifest.json')),
  readJson(join(experimentRoot, 'benchmark-adapters.json')),
  readJson(join(runsRoot, 'preflight', 'environment.json')),
  readJson(join(runsRoot, 'preflight', 'vendor-check.json')),
]);

const gates = {
  designFrozenBeforeOutcomes: design.status === 'frozen-for-preflight',
  schemasAndMatrixValid: true,
  benchmarkVersionsPinned: manifest.sources
    .filter((item) => item.repository)
    .every((item) => /^[a-f0-9]{40}$/u.test(item.commit)),
  officialEntrypointsManifested: manifest.sources.every(
    (item) => item.repository || item.dataset || item.projectUrl,
  ),
  benchmarkAdapterContractsComplete: adapters.adapters.every(
    (item) => item.harnessContractReady,
  ),
  sourceIntegrationsReady: adapters.adapters.every(
    (item) => item.sourceIntegrationReady,
  ),
  localLifecycleSmokePasses:
    smokeScore.strictSuccess === 1 && smokeAnalysis.cells === 1,
  deterministicHiddenScorers: false,
  factParityAudited: false,
  licenseAndTermsApproved: false,
  calibrationHasNoCeilingOrFloor: false,
  sampleSizeJustified: false,
  publicRepositoriesLocallyPinned: vendor.records.every(
    (item) => item.localMatchesPin,
  ),
  baseToolchain: environment.gates.baseToolchain,
  benchmarkRuntimeReady:
    environment.gates.webMallPythonCompatible &&
    environment.gates.containerRuntime &&
    environment.gates.linuxContainerHost &&
    environment.gates.workArenaExternalAccess &&
    environment.gates.stWebAgentBenchExternalAccess &&
    environment.gates.benchmarkServices,
  actorFilesystemAndToolsIsolated: environment.gates.actorIsolationEnforced,
  multimodalActorTransportVerified:
    environment.gates.multimodalActorTransportVerified,
  exactRunnerIdentityRecorded: environment.gates.exactRunnerIdentityRecorded,
  nativeBaselineSmokeTestsPass: false,
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
