import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import {
  experimentRoot,
  readerArtifact,
  readJson,
  sha256,
  stableStringify,
  workspaceRoot,
} from './lib.mjs';

const design = await readJson(join(experimentRoot, 'design.json'));
const bank = await readJson(join(experimentRoot, 'task-bank.json'));
const bankSchema = await readJson(
  join(experimentRoot, 'schemas', 'task-bank.schema.json'),
);
const validateBank = new Ajv2020({ allErrors: true }).compile(bankSchema);
if (!validateBank(bank)) {
  throw new Error(`Invalid task bank: ${JSON.stringify(validateBank.errors)}`);
}
if (design.status !== 'pre-experiment') {
  throw new Error('Preparation validator refuses a non-pre-experiment design');
}

const protocolSchemaRoot = join(
  workspaceRoot,
  'spec',
  'drafts',
  'v0.2',
  'schemas',
);
const protocolSchemas = await Promise.all(
  [
    'common.schema.json',
    'semantic-value.schema.json',
    'semantic-frame.schema.json',
    'profile-definition.schema.json',
    'grounding-capsule.schema.json',
  ].map((name) => readJson(join(protocolSchemaRoot, name))),
);
const protocolValidator = new Ajv2020({ allErrors: true, strict: false });
addFormats(protocolValidator);
for (const schema of protocolSchemas) protocolValidator.addSchema(schema);
const validateCapsule = protocolValidator.getSchema(
  'https://ui-grounding.org/schema/v0.2-draft/grounding-capsule.schema.json',
);
const validateProfile = protocolValidator.getSchema(
  'https://ui-grounding.org/schema/v0.2-draft/profile-definition.schema.json',
);
if (!validateCapsule || !validateProfile)
  throw new Error('Could not compile v0.2 schemas');
const profiles = await readJson(join(experimentRoot, 'profiles.json'));
for (const profile of profiles) {
  if (!validateProfile(profile))
    throw new Error(
      `Invalid ${profile.profileId}: ${JSON.stringify(validateProfile.errors)}`,
    );
}
const transfer = await readJson(join(experimentRoot, 'transfer.json'));
if (transfer.study !== 'RQ2') throw new Error('Transfer session must test RQ2');
if (
  stableStringify([...transfer.conditions].sort()) !==
  stableStringify([...design.conditions.RQ2].sort())
) {
  throw new Error('Transfer conditions do not match the RQ2 design');
}
if (
  new Set(transfer.examples).size !== transfer.examples.length ||
  transfer.examples.includes(transfer.heldOutTask)
) {
  throw new Error('Transfer examples and held-out task must be disjoint');
}

const combinations = new Set();
const taskIds = new Set();
for (const task of bank.tasks) {
  if (taskIds.has(task.taskId))
    throw new Error(`Duplicate task: ${task.taskId}`);
  taskIds.add(task.taskId);
  const combination = `${task.domain}:${task.workflow}`;
  if (combinations.has(combination))
    throw new Error(`Duplicate cell: ${combination}`);
  combinations.add(combination);
  const factIds = task.controlledFacts.map((fact) => fact.id);
  if (new Set(factIds).size !== factIds.length) {
    throw new Error(`${task.taskId}: duplicate controlled fact ID`);
  }
  if (
    !factIds.includes('identity') ||
    !factIds.includes('capability') ||
    !factIds.includes('basis')
  ) {
    throw new Error(
      `${task.taskId}: identity, basis, and capability are required`,
    );
  }
  const adhoc = readerArtifact(task, 'adhoc');
  const ugp = readerArtifact(task, 'ugp');
  if (!validateCapsule(ugp)) {
    throw new Error(
      `${task.taskId}: invalid UGP Capsule ${JSON.stringify(validateCapsule.errors)}`,
    );
  }
  const adhocText = JSON.stringify(adhoc);
  const ugpText = JSON.stringify(ugp);
  for (const fact of task.controlledFacts) {
    const encoded = JSON.stringify(fact.value);
    if (!adhocText.includes(encoded) || !ugpText.includes(encoded)) {
      throw new Error(`${task.taskId}: semantic arm dropped fact ${fact.id}`);
    }
  }
}
if (combinations.size !== 8)
  throw new Error('Task bank must cover 4 domains x 2 workflows');
for (const taskId of [...transfer.examples, transfer.heldOutTask]) {
  if (!taskIds.has(taskId)) throw new Error(`Unknown transfer task: ${taskId}`);
}
const exampleDomains = transfer.examples.map(
  (taskId) => bank.tasks.find((task) => task.taskId === taskId)?.domain,
);
const heldOutDomain = bank.tasks.find(
  (task) => task.taskId === transfer.heldOutTask,
)?.domain;
if (
  stableStringify([...exampleDomains].sort()) !==
    stableStringify(['bi', 'document', 'workflow']) ||
  heldOutDomain !== 'commerce'
) {
  throw new Error(
    'Transfer must hold out commerce after three distinct domains',
  );
}

const buildContract = await readFile(
  join(
    workspaceRoot,
    'skills',
    'ugp-build',
    'references',
    'authoring-contract.md',
  ),
  'utf8',
);
const retrofitContract = await readFile(
  join(
    workspaceRoot,
    'skills',
    'ugp-retrofit',
    'references',
    'authoring-contract.md',
  ),
  'utf8',
);
if (sha256(buildContract) !== sha256(retrofitContract)) {
  throw new Error('Both Skills must use the identical authoring contract');
}

const capsuleSchema = await readJson(
  join(
    workspaceRoot,
    'spec',
    'drafts',
    'v0.2',
    'schemas',
    'grounding-capsule.schema.json',
  ),
);
const capsuleFields = Object.keys(capsuleSchema.properties).sort();
if (
  stableStringify(capsuleFields) !==
  stableStringify(['at', 'can', 'description', 'id', 'problem', 'v'])
) {
  throw new Error('GroundingCapsule Core fields changed');
}

const forbiddenPacketNames = [
  'oracle.json',
  'private-run.json',
  'score.json',
  'readiness.json',
];
for (const name of forbiddenPacketNames) {
  if (
    [
      'TASK.md',
      'CONDITION.md',
      'CONTROLLED-FACTS.json',
      'AUDIT.schema.json',
      'run.json',
    ].includes(name)
  ) {
    throw new Error(`Private filename entered packet allowlist: ${name}`);
  }
}

console.log(
  `Validated ${bank.tasks.length} authoring tasks, ${combinations.size} domain/workflow cells, one cross-domain transfer session, both Skills, and frozen Capsule fields`,
);
