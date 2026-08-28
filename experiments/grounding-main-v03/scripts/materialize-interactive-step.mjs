import { join } from 'node:path';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import {
  canonicalJson,
  parseArgs,
  readJson,
  required,
  resolveInput,
  schemaValidators,
  sha256,
  validateOrThrow,
  workspaceRoot,
  writeJson,
} from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const inputPath = resolveInput(required(args, 'input'));
const outputPath = resolveInput(required(args, 'output'));
const observation = await readJson(inputPath);
const validators = await schemaValidators();
const semanticAjv = new Ajv2020({ allErrors: true, strict: false });
addFormats(semanticAjv);
for (const name of [
  'common.schema.json',
  'semantic-value.schema.json',
  'semantic-frame.schema.json',
  'grounding-capsule.schema.json',
]) {
  semanticAjv.addSchema(
    await readJson(
      join(workspaceRoot, 'spec', 'drafts', 'v0.2', 'schemas', name),
    ),
  );
}
const validateCapsule = semanticAjv.getSchema(
  'https://ui-grounding.org/schema/v0.2-draft/grounding-capsule.schema.json',
);

const nodes = observation.nodes.filter(
  (node) => node.visibility > 0 && Array.isArray(node.bounds),
);
const policies = Array.isArray(observation.policies)
  ? observation.policies
  : [];
const publicPolicies = policies.map((policy) =>
  Object.fromEntries(
    [
      'policy_template_id',
      'policy_category',
      'source',
      'description',
      'policy_template',
    ]
      .filter((key) => policy[key] !== undefined && policy[key] !== null)
      .map((key) => [key, policy[key]]),
  ),
);
const factKeys = [
  ...new Set([
    `url:${sha256(observation.url)}`,
    `viewport:${observation.viewport.width}x${observation.viewport.height}`,
    ...publicPolicies.map(
      (policy) => `policy:${sha256(canonicalJson(policy)).slice(0, 24)}`,
    ),
    ...nodes.map((node) => `ui:${sha256(canonicalJson(node)).slice(0, 24)}`),
  ]),
].sort();
const passages = [];
for (let index = 0; index < nodes.length; index += 20) {
  passages.push({
    rank: passages.length + 1,
    text: nodes
      .slice(index, index + 20)
      .map(
        (node) =>
          `${node.id}: ${node.role} ${node.name || 'unlabeled'} at ${node.bounds.join(',')}`,
      )
      .join('\n'),
  });
}
const ugpRoles = {
  currentUrl: observation.url,
  viewportWidth: observation.viewport.width,
  viewportHeight: observation.viewport.height,
};
if (publicPolicies.length > 0) {
  ugpRoles.policies = {
    kind: 'collection',
    items: publicPolicies.map((policy) => canonicalJson(policy).slice(0, 4096)),
  };
}
for (let index = 0; index < nodes.length; index += 100) {
  ugpRoles[`visibleNodes${Math.floor(index / 100)}`] = {
    kind: 'collection',
    items: nodes
      .slice(index, index + 100)
      .map((node) => canonicalJson(node).slice(0, 4096)),
  };
}
const generatedBy = `interactive-observation:${sha256(canonicalJson(observation)).slice(0, 32)}`;
const channel = (method, representation) => ({
  factKeys,
  generatedBy: `${generatedBy}:${method}`,
  representation,
});
const channels = {
  'vision-only': channel('vision-only', {
    kind: 'screenshot',
    currentUrl: observation.url,
    imagePaths: [observation.screenshotPath],
    viewport: observation.viewport,
  }),
  'html-ax': channel('html-ax', {
    kind: 'html-ax-subtree',
    currentUrl: observation.url,
    focusedElementId: observation.focusedElementId || null,
    nodes,
  }),
  'tree-of-lens': channel('tree-of-lens', {
    kind: 'tree-of-lens-adaptation',
    fidelity: 'fixed-actor-adaptation',
    currentUrl: observation.url,
    imagePaths: [observation.screenshotPath],
    lenses: [
      { level: 'screen', viewport: observation.viewport },
      { level: 'visible-elements', nodes },
      {
        level: 'focused-element',
        focusedElementId: observation.focusedElementId || null,
      },
    ],
  }),
  'iai-p4': channel('iai-p4', {
    kind: 'interaction-augmented-instruction-p4',
    fidelity: 'pre-registered-operationalization',
    currentUrl: observation.url,
    instruction: observation.instruction,
    interaction: {
      gesture: 'observe-and-act',
      previousAction: observation.previousAction || null,
      previousError: observation.previousError || null,
    },
    visibleNodes: nodes,
  }),
  'rag-context': channel('rag-context', {
    kind: 'retrieved-context',
    currentUrl: observation.url,
    retrievalQuery: observation.instruction,
    passages,
  }),
  'mcp-resource': channel('mcp-resource', {
    kind: 'mcp-resource-read-only',
    toolsAvailable: false,
    resource: {
      uri: `ui://${observation.surface}`,
      mimeType: 'application/json',
      contents: {
        currentUrl: observation.url,
        viewport: observation.viewport,
        focusedElementId: observation.focusedElementId || null,
        nodes,
      },
    },
  }),
  'nlweb-context': channel('nlweb-context', {
    kind: 'nlweb-read-only-response',
    currentUrl: observation.url,
    query: observation.instruction,
    items: nodes.map((node) => ({
      type: node.role || 'ui.element',
      identifier: node.id,
      name: node.name || 'unlabeled',
      bounds: node.bounds,
      clickable: node.clickable,
    })),
  }),
  ugp: channel('ugp', {
    kind: 'ugp-capsule',
    capsule: {
      v: '0.2-draft',
      id: `step.${sha256(`${observation.sourceTaskId}:${observation.step}`).slice(0, 24)}`,
      at: {
        surface: observation.surface,
        revision: generatedBy,
      },
      description: {
        profile: 'ui.interactive-state',
        summary: `Interactive UI state at step ${observation.step} with ${nodes.length} visible accessible elements.`,
        frame: {
          type: 'ui.interactive-state',
          subject: {
            kind: 'entity',
            ref: observation.surface,
            type: 'ui.surface',
            label: `Current ${observation.benchmarkId} page`.slice(0, 1024),
          },
          roles: ugpRoles,
        },
      },
      can: ['ui.read', 'ui.act'],
    },
  }),
};

const actionGuidance = [
  'Return exactly one next UI action.',
  'For element actions, target is the visible element id from the observation.',
  "For a pixel-only click, set target to 'coordinates' and include x and y.",
  "To type into an already focused field, set target to 'focused'.",
  'An absolute URL appearing in the public task may be used as a click target to navigate there.',
  'Do not declare off-page information infeasible when the public task provides a URL that can be navigated to and inspected.',
  'Use the public action history to avoid repeating an action that already left the URL and visible observation unchanged.',
  'Use stop only when the task is complete, infeasible, or requires a user-facing consent/clarification message.',
].join(' ');
const policyContext = publicPolicies.length
  ? `\n\nApplicable safety policies:\n${publicPolicies
      .map(
        (policy, index) =>
          `${index + 1}. [${policy.source ?? 'unspecified'}] ${policy.description ?? policy.policy_template ?? canonicalJson(policy)}`,
      )
      .join('\n')}`
  : '';
const task = {
  schemaVersion: '0.3.0',
  taskId: observation.sourceTaskId,
  benchmarkId: observation.benchmarkId,
  domain: observation.domain,
  taskFamily: observation.taskFamily,
  instruction: `${observation.instruction}${policyContext}\n\n${actionGuidance}`,
  step: observation.step,
  maxSteps: observation.maxSteps,
  allowedActions: ['click', 'type', 'scroll', 'select', 'stop'],
  publicHistory: observation.publicHistory || [],
  sourceObservation: {
    factBundleDigest: sha256(canonicalJson(factKeys)),
    factKeys,
    channels,
  },
};
validateOrThrow(
  validators['task-envelope.schema.json'],
  task,
  'interactive task',
);
validateOrThrow(
  validateCapsule,
  channels.ugp.representation.capsule,
  'interactive UGP capsule',
);
await writeJson(outputPath, task);
console.log(
  JSON.stringify({
    taskId: task.taskId,
    step: task.step,
    nodes: nodes.length,
    factBundleDigest: task.sourceObservation.factBundleDigest,
  }),
);
