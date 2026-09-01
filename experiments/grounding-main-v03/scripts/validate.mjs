import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import {
  assert,
  canonicalJson,
  experimentRoot,
  findForbiddenKeys,
  normalizeScreenqaAnswer,
  readJson,
  sameSet,
  schemaValidators,
  sha256,
  validateOrThrow,
  workspaceRoot,
} from './lib.mjs';

const [
  design,
  manifest,
  adapterManifest,
  fixture,
  response,
  gold,
  developmentPlan,
  authorityManifest,
  runtimeAdapterMetadata,
  crmProfile,
  officialStTasks,
  validators,
] = await Promise.all([
  readJson(join(experimentRoot, 'design.json')),
  readJson(join(experimentRoot, 'benchmark-manifest.json')),
  readJson(join(experimentRoot, 'benchmark-adapters.json')),
  readJson(join(experimentRoot, 'fixtures', 'tasks', 'bi-kpi-qa.json')),
  readJson(
    join(experimentRoot, 'fixtures', 'responses', 'bi-kpi-correct.json'),
  ),
  readJson(join(experimentRoot, 'fixtures', 'gold', 'bi-kpi-qa.gold.json')),
  readJson(join(experimentRoot, 'sampling', 'suitecrm-development-v1.json')),
  readJson(
    join(
      experimentRoot,
      'runtime-injection',
      'suitecrm-v8',
      'authority-manifest.json',
    ),
  ),
  readJson(
    join(
      experimentRoot,
      'runtime-injection',
      'suitecrm-v8',
      'adapter-metadata.json',
    ),
  ),
  readJson(
    join(
      experimentRoot,
      'runtime-injection',
      'suitecrm-v8',
      'profiles',
      'crm.profile.json',
    ),
  ),
  readJson(
    join(
      experimentRoot,
      'vendor',
      'st-webagentbench',
      'stwebagentbench',
      'test.raw.json',
    ),
  ),
  schemaValidators(),
]);

assert(
  design.status === 'runtime-injection-development',
  'Design must identify the adaptive runtime-injection development phase',
);
assert(
  design.models.length === 2,
  'Main design must register exactly two actor models',
);
assert(
  design.groundingMethods.length === 8,
  'Main design must register exactly eight grounding methods',
);
assert(
  design.benchmarks.length === 5,
  'Main design must register exactly five official benchmark strata',
);

for (const [label, values] of [
  ['model', design.models],
  ['grounding method', design.groundingMethods],
  ['benchmark', design.benchmarks],
]) {
  const ids = values.map((item) => item.id);
  assert(new Set(ids).size === ids.length, `Duplicate ${label} ID`);
}

const plannedPrimary =
  design.models.length *
  design.groundingMethods.length *
  design.benchmarks.reduce((sum, item) => sum + item.plannedN, 0);
assert(
  plannedPrimary === design.sampling.plannedPrimaryEpisodes,
  `Primary episode count mismatch: computed ${plannedPrimary}`,
);
const plannedRobustnessTasks = design.benchmarks.reduce(
  (sum, item) => sum + item.robustnessN,
  0,
);
assert(
  plannedRobustnessTasks === design.sampling.plannedRobustnessTasks,
  `Robustness task count mismatch: computed ${plannedRobustnessTasks}`,
);
for (const benchmark of design.benchmarks) {
  assert(
    Math.abs(
      benchmark.robustnessN / benchmark.plannedN -
        design.sampling.robustnessFraction,
    ) <=
      1 / benchmark.plannedN,
    `${benchmark.id} robustness subset is not the registered approximately 20% sample`,
  );
}

const officialSuiteCrmIds = officialStTasks
  .filter((task) => task.sites?.[0] === 'suitecrm')
  .map((task) => `st:${task.task_id}`)
  .sort();
assert(
  sameSet(developmentPlan.taskIds, officialSuiteCrmIds),
  'SuiteCRM development plan must include the complete official application slice',
);
assert(
  developmentPlan.taskCount === developmentPlan.taskIds.length &&
    developmentPlan.taskCount === 170,
  'SuiteCRM development task count must remain 170',
);
assert(
  sameSet(
    developmentPlan.methods,
    design.groundingMethods.map((method) => method.id),
  ) &&
    sameSet(
      developmentPlan.models,
      design.models.map((model) => model.id),
    ),
  'SuiteCRM development matrix factors diverge from the design',
);
assert(
  developmentPlan.primaryEpisodes ===
    developmentPlan.taskCount *
      developmentPlan.methods.length *
      developmentPlan.models.length *
      developmentPlan.primaryReplicates,
  'SuiteCRM primary episode count is stale',
);
assert(
  developmentPlan.robustnessSourceTaskIds.length ===
    developmentPlan.robustnessTaskCount &&
    developmentPlan.robustnessSourceTaskIds.every((taskId) =>
      developmentPlan.taskIds.includes(taskId),
    ),
  'SuiteCRM robustness subset is invalid',
);
assert(
  developmentPlan.additionalRobustnessEpisodes ===
    developmentPlan.robustnessTaskCount *
      developmentPlan.methods.length *
      developmentPlan.models.length *
      (developmentPlan.robustnessReplicates -
        developmentPlan.primaryReplicates) &&
    developmentPlan.totalEpisodes ===
      developmentPlan.primaryEpisodes +
        developmentPlan.additionalRobustnessEpisodes,
  'SuiteCRM robustness or total episode count is stale',
);
assert(
  runtimeAdapterMetadata.adapterId === 'suitecrm-8.8.1-runtime-v8' &&
    authorityManifest.application === runtimeAdapterMetadata.application &&
    authorityManifest.applicationVersion === '8.8.1' &&
    authorityManifest.sources.length >= 6 &&
    authorityManifest.sources.every(
      (source) =>
        typeof source.id === 'string' &&
        typeof source.locator === 'string' &&
        typeof source.revision === 'string',
    ),
  'SuiteCRM runtime authority manifest is incomplete',
);
const runtimeAdapterSource = await readFile(
  join(experimentRoot, 'runtime-injection', 'suitecrm-v8', 'adapter.js'),
  'utf8',
);
assert(
  runtimeAdapterSource.includes('__ADAPTER_DIGEST__') &&
    runtimeAdapterSource.includes('__AUTHORITY_MANIFEST_DIGEST__') &&
    runtimeAdapterSource.includes('__UGP_EXPERIMENT_BRIDGE__') &&
    runtimeAdapterSource.includes('pendingRelationshipFields') &&
    runtimeAdapterSource.includes('hiddenPendingRelationshipSelectionCount') &&
    runtimeAdapterSource.includes('activationMatchesSelection') &&
    runtimeAdapterSource.includes("'crm.field'") &&
    runtimeAdapterSource.includes('referentIndex') &&
    runtimeAdapterSource.includes('describeReferent') &&
    runtimeAdapterSource.includes("origin: 'application-runtime'"),
  'SuiteCRM runtime adapter is missing provenance or bridge markers',
);
const plannedAdditional =
  plannedRobustnessTasks *
  design.models.length *
  design.groundingMethods.length *
  (design.sampling.robustnessReplicates - design.sampling.primaryReplicates);
assert(
  plannedAdditional === design.sampling.plannedAdditionalRobustnessEpisodes,
  `Additional robustness episode count mismatch: computed ${plannedAdditional}`,
);

const knownTargets = new Set([
  ...design.benchmarks.map((item) => item.id),
  ...design.groundingMethods.map((item) => item.id),
  'native-systems-table',
]);
for (const source of manifest.sources) {
  for (const target of source.usedBy) {
    assert(
      knownTargets.has(target),
      `${source.id} references unknown target ${target}`,
    );
  }
  if (source.repository) {
    assert(
      /^https:\/\/github\.com\//u.test(source.repository),
      `${source.id} repository must use an official HTTPS GitHub URL`,
    );
    assert(
      /^[a-f0-9]{40}$/u.test(source.commit),
      `${source.id} must pin a 40-character commit`,
    );
  }
  assert(source.integrationStatus, `${source.id} is missing integrationStatus`);
}

assert(
  adapterManifest.adapters.length === design.benchmarks.length,
  'Every main-table benchmark stratum needs one adapter record',
);
for (const benchmark of design.benchmarks) {
  const adapter = adapterManifest.adapters.find(
    (item) => item.benchmarkId === benchmark.id,
  );
  assert(adapter, `Missing adapter contract for ${benchmark.id}`);
  assert(
    adapter.harnessContractReady === true,
    `${benchmark.id} harness contract is not ready`,
  );
  assert(
    typeof adapter.sourceIntegrationReady === 'boolean',
    `${benchmark.id} integration readiness is not explicit`,
  );
}

validateOrThrow(
  validators['task-envelope.schema.json'],
  fixture,
  'fixture task',
);
validateOrThrow(
  validators['actor-response.schema.json'],
  response,
  'fixture response',
);
validateOrThrow(validators['gold.schema.json'], gold, 'fixture gold');
assert(
  gold.taskId === fixture.taskId,
  'Fixture gold does not match fixture task',
);

const computedFactDigest = sha256(
  canonicalJson(fixture.sourceObservation.factKeys),
);
assert(
  fixture.sourceObservation.factBundleDigest === computedFactDigest,
  `Fixture factBundleDigest is stale; replace it with ${computedFactDigest}`,
);
for (const method of design.groundingMethods) {
  const channel = fixture.sourceObservation.channels[method.id];
  assert(channel, `Fixture does not cover grounding adapter ${method.id}`);
  assert(
    sameSet(channel.factKeys, fixture.sourceObservation.factKeys),
    `Fixture channel ${method.id} fails declared fact parity`,
  );
}
assert(
  findForbiddenKeys(fixture).includes('$.taskId'),
  'Leakage scanner self-check failed',
);
assert(
  normalizeScreenqaAnswer(' The, Quick! Fox ') === 'quick fox',
  'ScreenQA official SQuAD normalization self-check failed',
);

const protocolSchemaRoot = join(
  workspaceRoot,
  'spec',
  'drafts',
  'v0.2',
  'schemas',
);
const protocolSchemaNames = [
  'common.schema.json',
  'authority-manifest.schema.json',
  'semantic-value.schema.json',
  'semantic-frame.schema.json',
  'profile-definition.schema.json',
  'grounding-capsule.schema.json',
];
const protocolAjv = new Ajv2020({ allErrors: true, strict: false });
addFormats(protocolAjv);
for (const name of protocolSchemaNames) {
  protocolAjv.addSchema(await readJson(join(protocolSchemaRoot, name)));
}
const validateCapsule = protocolAjv.getSchema(
  'https://ui-grounding.org/schema/v0.2-draft/grounding-capsule.schema.json',
);
const validateAuthorityManifest = protocolAjv.getSchema(
  'https://ui-grounding.org/schema/v0.2-draft/authority-manifest.schema.json',
);
const validateProfile = protocolAjv.getSchema(
  'https://ui-grounding.org/schema/v0.2-draft/profile-definition.schema.json',
);
assert(validateCapsule, 'Could not compile the UGP v0.2 Capsule schema');
assert(
  validateAuthorityManifest && validateAuthorityManifest(authorityManifest),
  `Invalid v8 Authority Manifest: ${JSON.stringify(validateAuthorityManifest?.errors)}`,
);
assert(
  validateProfile && validateProfile(crmProfile),
  `Invalid v8 CRM Profile: ${JSON.stringify(validateProfile?.errors)}`,
);
for (const frame of crmProfile.frames) {
  const questions = new Map(
    frame.competencyQuestions.map((question) => [question.id, question]),
  );
  assert(
    questions.get('identity')?.answerPaths.includes('subject') &&
      questions.get('identity')?.includeInSummary === true &&
      questions.get('meaning')?.includeInSummary === true,
    `${frame.type} lacks canonical identity/meaning competency coverage`,
  );
  for (const question of frame.competencyQuestions) {
    for (const path of question.answerPaths) {
      const role = path.startsWith('roles.') ? path.slice(6) : null;
      assert(
        !role ||
          (frame.roles[role] &&
            frame.requiredRoles.includes(role) &&
            (!question.includeInSummary ||
              frame.summaryPlan.roles.includes(role))),
        `${frame.type} has an invalid competency answer path: ${path}`,
      );
    }
  }
}
const fixtureCapsule =
  fixture.sourceObservation.channels.ugp.representation.capsule;
if (!validateCapsule(fixtureCapsule)) {
  throw new Error(
    `Fixture UGP Capsule is invalid:\n${JSON.stringify(validateCapsule.errors, null, 2)}`,
  );
}

console.log(
  JSON.stringify({
    valid: true,
    models: design.models.length,
    groundingMethods: design.groundingMethods.length,
    benchmarkStrata: design.benchmarks.length,
    mainTableRows: design.models.length * design.groundingMethods.length,
    mainTableCells:
      design.models.length *
      design.groundingMethods.length *
      design.benchmarks.length,
    plannedPrimaryEpisodes: plannedPrimary,
    plannedAdditionalRobustnessEpisodes: plannedAdditional,
    pinnedRepositories: manifest.sources.filter((item) => item.repository)
      .length,
  }),
);
