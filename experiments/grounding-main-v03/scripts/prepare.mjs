import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import {
  assert,
  canonicalJson,
  experimentRoot,
  findForbiddenKeys,
  fixedSystemInstruction,
  parseArgs,
  readJson,
  required,
  resolveInput,
  responseSchemaForActor,
  runsRoot,
  schemaValidators,
  sha256,
  validateOrThrow,
  writeJson,
} from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const taskPath = resolveInput(required(args, 'task'));
const methodId = required(args, 'method');
const modelId = required(args, 'model');
const runId = required(args, 'run-id');
const replicate = Number(args.replicate ?? 1);

assert(
  Number.isInteger(replicate) && replicate >= 1,
  '--replicate must be a positive integer',
);
assert(/^[A-Za-z0-9._-]+$/u.test(runId), '--run-id contains unsafe characters');

const [design, task, validators] = await Promise.all([
  readJson(join(experimentRoot, 'design.json')),
  readJson(taskPath),
  schemaValidators(),
]);
validateOrThrow(validators['task-envelope.schema.json'], task, 'task envelope');

const method = design.groundingMethods.find((item) => item.id === methodId);
const model = design.models.find((item) => item.id === modelId);
assert(method, `Unknown grounding method: ${methodId}`);
assert(model, `Unknown actor model: ${modelId}`);
const channel = task.sourceObservation.channels[methodId];
assert(channel, `Task has no ${methodId} representation`);
assert(
  channel.factKeys.every((factKey) =>
    task.sourceObservation.factKeys.includes(factKey),
  ),
  `${methodId} representation declares facts outside the source observation`,
);

const computedFactDigest = sha256(
  canonicalJson(task.sourceObservation.factKeys),
);
assert(
  computedFactDigest === task.sourceObservation.factBundleDigest,
  `Fact bundle digest mismatch; expected ${computedFactDigest}`,
);
const publicHistory = task.publicHistory ?? [];
for (const [index, entry] of publicHistory.entries()) {
  assert(
    Number.isInteger(entry.step) &&
      typeof entry.action === 'string' &&
      entry.result &&
      typeof entry.result.url === 'string' &&
      (!entry.result.chatMessages ||
        (Array.isArray(entry.result.chatMessages) &&
          entry.result.chatMessages.every(
            (message) =>
              message &&
              typeof message.role === 'string' &&
              typeof message.message === 'string',
          ))) &&
      Object.keys(entry).every((key) =>
        ['step', 'action', 'result'].includes(key),
      ) &&
      Object.keys(entry.result).every((key) =>
        ['url', 'chatMessages'].includes(key),
      ),
    `Public history item ${index} has an invalid public step result`,
  );
}

const episodeKey = {
  runId,
  taskId: task.taskId,
  methodId,
  modelId,
  replicate,
  ...(task.maxSteps > 1 ? { step: task.step } : {}),
};
const episodeId = sha256(canonicalJson(episodeKey)).slice(0, 24);
const taskOpaqueId = sha256(`task:${task.taskId}`).slice(0, 24);
const sourceDigest = sha256(canonicalJson(task));
const representationDigest = sha256(canonicalJson(channel.representation));

const request = {
  schemaVersion: '0.3.0',
  episodeId,
  condition: {
    groundingMethod: methodId,
    model: modelId,
    reasoningEffort: model.reasoningEffort,
    replicate,
  },
  actor: {
    system: fixedSystemInstruction,
    task: task.instruction,
    observation: channel.representation,
    publicHistory,
    allowedActions: task.allowedActions,
    remainingSteps: Math.max(0, task.maxSteps - task.step + 1),
    responseSchema: responseSchemaForActor(task.allowedActions),
  },
  audit: {
    freshContextRequired: true,
    toolsAllowed: false,
    goldIncluded: false,
    sourceDigest,
    representationDigest,
    factBundleDigest: computedFactDigest,
  },
};
validateOrThrow(
  validators['actor-request.schema.json'],
  request,
  'actor request',
);
const forbidden = findForbiddenKeys(request);
assert(
  forbidden.length === 0,
  `Actor request leaked private keys: ${forbidden.join(', ')}`,
);

const episodeRoot = join(runsRoot, runId, 'episodes', episodeId);
await mkdir(episodeRoot, { recursive: true });
await Promise.all([
  writeJson(join(episodeRoot, 'request.json'), request),
  writeJson(join(episodeRoot, 'private.json'), {
    schemaVersion: '0.3.0',
    benchmarkId: task.benchmarkId,
    domain: task.domain,
    sourceTaskId: task.taskId,
    taskFamily: task.taskFamily,
    taskOpaqueId,
    taskPath,
    methodFidelity: method.fidelity,
    packetDigest: sha256(canonicalJson(request)),
  }),
]);

console.log(
  JSON.stringify({
    runId,
    episodeId,
    request: join(episodeRoot, 'request.json'),
  }),
);
