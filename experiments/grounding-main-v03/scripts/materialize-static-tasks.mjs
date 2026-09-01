import { access, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import {
  assert,
  canonicalJson,
  experimentRoot,
  parseArgs,
  readJson,
  runsRoot,
  schemaValidators,
  sha256,
  validateOrThrow,
  workspaceRoot,
  writeJson,
} from './lib.mjs';

const methods = [
  'vision-only',
  'html-ax',
  'tree-of-lens',
  'iai-p4',
  'rag-context',
  'mcp-resource',
  'nlweb-context',
  'ugp',
];
const args = parseArgs(process.argv.slice(2));
const ricoRoot = resolve(
  String(
    args['rico-root'] ?? process.env.UGP_RICO_ROOT ?? 'E:/UGP-exp-data/rico',
  ),
);
const outputRoot = join(runsRoot, 'materialized-static');
const sealedRoot = join(experimentRoot, '.sealed', 'static-gold');
const validators = await schemaValidators();
const semanticSchemaRoot = join(
  workspaceRoot,
  'spec',
  'drafts',
  'v0.2',
  'schemas',
);
const semanticAjv = new Ajv2020({ allErrors: true, strict: false });
addFormats(semanticAjv);
for (const name of [
  'common.schema.json',
  'semantic-value.schema.json',
  'semantic-frame.schema.json',
  'grounding-capsule.schema.json',
]) {
  semanticAjv.addSchema(await readJson(join(semanticSchemaRoot, name)));
}
const validateCapsule = semanticAjv.getSchema(
  'https://ui-grounding.org/schema/v0.2-draft/grounding-capsule.schema.json',
);

function factsForNodes(prefix, nodes, extras = []) {
  return [
    ...new Set([
      ...extras,
      ...nodes.map(
        (node) => `${prefix}:${sha256(canonicalJson(node)).slice(0, 24)}`,
      ),
    ]),
  ].sort();
}

function passages(nodes, chunkSize = 20) {
  const output = [];
  for (let index = 0; index < nodes.length; index += chunkSize) {
    output.push({
      rank: output.length + 1,
      text: nodes
        .slice(index, index + chunkSize)
        .map(
          (node) =>
            `${node.id}: ${node.text || node.label || node.role || 'unlabeled'} at ${node.bounds.join(',')}`,
        )
        .join('\n'),
    });
  }
  return output;
}

function ugpRoles(nodes, viewport, selection) {
  const roles = {
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
  };
  if (selection) {
    roles.selection = canonicalJson(selection).slice(0, 4096);
  }
  for (let index = 0; index < nodes.length; index += 100) {
    roles[`visibleNodes${Math.floor(index / 100)}`] = {
      kind: 'collection',
      items: nodes
        .slice(index, index + 100)
        .map((node) => canonicalJson(node).slice(0, 4096)),
    };
  }
  return roles;
}

function commonChannels({
  factKeys,
  nodes,
  imagePaths,
  viewport,
  selection,
  surface,
  question,
  generatedBy,
}) {
  const targetIds = selection?.targetNodeIds ?? [];
  const targetNodes = nodes.filter((node) => targetIds.includes(node.id));
  const selectedSummary =
    targetNodes
      .map((node) => node.text || node.label)
      .filter(Boolean)
      .join('; ') || 'No textual node directly covers the target point.';
  const capsuleLabel = selectedSummary.slice(0, 1024);
  const channel = (id, representation) => ({
    factKeys,
    generatedBy: `${generatedBy}:${id}:v1`,
    representation,
  });
  return {
    'vision-only': channel('vision-only', {
      kind: selection ? 'screenshot-selection' : 'screenshot',
      imagePaths: [imagePaths[0]],
      viewport,
      ...(selection ? { selection } : {}),
    }),
    'html-ax': channel('html-ax', {
      kind: 'html-ax-subtree',
      selectionAnchor: targetIds.length ? targetIds : null,
      nodes,
    }),
    'tree-of-lens': channel('tree-of-lens', {
      kind: 'tree-of-lens-adaptation',
      fidelity: 'fixed-actor-adaptation',
      imagePaths,
      lenses: [
        { level: 'screen', nodes },
        ...(selection
          ? [
              { level: 'region', targetNodeIds: targetIds },
              { level: 'local', summary: selectedSummary },
            ]
          : []),
      ],
    }),
    'iai-p4': channel('iai-p4', {
      kind: 'interaction-augmented-instruction-p4',
      fidelity: 'pre-registered-operationalization',
      instruction: question,
      interaction: selection
        ? { gesture: 'point', point: selection.point }
        : { gesture: 'observe-screen' },
      visibleNodes: nodes,
    }),
    'rag-context': channel('rag-context', {
      kind: 'retrieved-context',
      retrievalQuery: question,
      passages: passages(nodes),
    }),
    'mcp-resource': channel('mcp-resource', {
      kind: 'mcp-resource-read-only',
      toolsAvailable: false,
      resource: {
        uri: `ui://${surface}`,
        mimeType: 'application/json',
        contents: { viewport, selection: selection ?? null, nodes },
      },
    }),
    'nlweb-context': channel('nlweb-context', {
      kind: 'nlweb-read-only-response',
      query: question,
      items: nodes.map((node) => ({
        type: node.role ?? 'ui.element',
        identifier: node.id,
        name: node.text || node.label || 'unlabeled',
        bounds: node.bounds,
      })),
    }),
    ugp: channel('ugp', {
      kind: 'ugp-capsule',
      capsule: {
        v: '0.2-draft',
        id: selection ? `selection.${sha256(surface).slice(0, 16)}` : surface,
        at: { surface, revision: generatedBy },
        referent: {
          nodeId:
            (selection ? targetIds[0] : null) ??
            (selection ? `selection.${sha256(surface).slice(0, 16)}` : surface),
          revision: generatedBy,
        },
        description: {
          profile: selection ? 'ui.pointed-referent' : 'ui.visible-screen',
          summary: selection
            ? `The pointed region is associated with: ${capsuleLabel}`
            : `Visible screen containing ${nodes.length} extracted UI nodes.`,
          frame: {
            type: selection ? 'ui.pointed-referent' : 'ui.visible-screen',
            subject: {
              kind: 'entity',
              ref: selection ? 'current.selection' : surface,
              type: 'ui.surface',
              label: capsuleLabel,
            },
            roles: ugpRoles(nodes, viewport, selection),
          },
        },
        can: ['ui.read'],
      },
    }),
  };
}

function flattenRico(root) {
  const nodes = [];
  function visit(node, path) {
    if (!node || typeof node !== 'object') return;
    const rawText = [node.text, node['content-desc']]
      .flatMap((value) => (Array.isArray(value) ? value : [value]))
      .filter((value) => typeof value === 'string' && value.trim())
      .join(' | ')
      .trim();
    const bounds = Array.isArray(node.bounds) ? node.bounds.map(Number) : null;
    const semantic =
      rawText ||
      node.clickable === true ||
      node.selected === true ||
      node.focused === true;
    if (
      semantic &&
      bounds?.length === 4 &&
      node['visible-to-user'] !== false &&
      node.visibility !== 'invisible'
    ) {
      nodes.push({
        id: `vh-${path.join('-') || 'root'}`,
        role: String(node.class ?? 'ui.element'),
        text: rawText,
        bounds,
        clickable: Boolean(node.clickable),
        selected: Boolean(node.selected),
        focused: Boolean(node.focused),
      });
    }
    for (const [index, child] of (node.children ?? []).entries()) {
      visit(child, [...path, index]);
    }
  }
  visit(root, []);
  return nodes;
}

function shuffledOptions(options, key) {
  return [...options].sort((left, right) =>
    sha256(`${key}:${left.sourceId}`).localeCompare(
      sha256(`${key}:${right.sourceId}`),
    ),
  );
}

async function materializeScreenpr() {
  const selection = await readJson(
    join(runsRoot, 'source-data', 'screenpr', 'selection.json'),
  );
  const datasetRoot = join(experimentRoot, 'vendor', 'screenpr-data');
  const dictionaries = Object.fromEntries(
    await Promise.all(
      ['mobile', 'os', 'web'].map(async (modality) => [
        modality,
        await readJson(join(datasetRoot, `ScreenPR_${modality}_dict.json`)),
      ]),
    ),
  );
  const manifestRows = [];
  const selectedTasks = args.limit
    ? selection.tasks.slice(0, Number(args.limit))
    : selection.tasks;
  for (const selected of selectedTasks) {
    const safeId = selected.sourceTaskId.replaceAll(':', '-');
    const record = await readJson(
      join(
        runsRoot,
        'source-data',
        'screenpr',
        'extracted',
        'records',
        `${safeId}.json`,
      ),
    );
    const source = dictionaries[selected.modality][String(selected.sourceId)];
    assert(
      source,
      `Missing ScreenPR dictionary row for ${selected.sourceTaskId}`,
    );
    const distractorIds = [...source.similar_element_ids]
      .sort((left, right) =>
        sha256(`${selected.sourceTaskId}:distractor:${left}`).localeCompare(
          sha256(`${selected.sourceTaskId}:distractor:${right}`),
        ),
      )
      .slice(0, 3);
    const options = shuffledOptions(
      [source.idx, ...distractorIds].map((sourceId) => {
        const candidate = dictionaries[selected.modality][String(sourceId)];
        assert(
          candidate,
          `Missing ScreenPR candidate ${selected.modality}:${sourceId}`,
        );
        const description =
          candidate.description_human ?? candidate.description_detailed_gt;
        assert(
          typeof description === 'string' && description.length > 0,
          `Missing ScreenPR description ${selected.modality}:${sourceId}`,
        );
        return { sourceId, description };
      }),
      selected.sourceTaskId,
    );
    assert(
      options.length === 4,
      `${selected.sourceTaskId} does not have four options`,
    );
    const labels = ['A', 'B', 'C', 'D'];
    const targetLabel =
      labels[options.findIndex((option) => option.sourceId === source.idx)];
    const nodes = record.ocrNodes;
    const factKeys = factsForNodes('ocr', nodes, [
      `viewport:${record.viewport.width}x${record.viewport.height}`,
      `point:${record.point.join(',')}`,
    ]);
    const imagePaths = record.renderedImages.map((image) => image.path);
    const question = [
      'The screenshot contains a user-marked red target point.',
      'Which option best describes the UI region indicated by the point?',
      'Answer with only A, B, C, or D.',
      ...options.map(
        (option, index) => `${labels[index]}. ${option.description}`,
      ),
    ].join('\n');
    const task = {
      schemaVersion: '0.3.0',
      taskId: selected.sourceTaskId,
      benchmarkId: 'screenpr-referent',
      domain: selected.modality,
      taskFamily: 'pointed-referent-recognition',
      instruction: question,
      step: 1,
      maxSteps: 1,
      allowedActions: ['answer'],
      publicHistory: [],
      sourceObservation: {
        factBundleDigest: sha256(canonicalJson(factKeys)),
        factKeys,
        channels: commonChannels({
          factKeys,
          nodes,
          imagePaths,
          viewport: record.viewport,
          selection: {
            kind: 'point',
            point: record.point,
            targetNodeIds: record.targetNodeIds,
          },
          surface: `screenpr/${selected.modality}/${sha256(selected.sourceTaskId).slice(0, 16)}`,
          question,
          generatedBy: `screenpr-static-adapter:${record.recordDigest}`,
        }),
      },
    };
    assert(
      methods.every((method) => task.sourceObservation.channels[method]),
      `${selected.sourceTaskId} is missing a method channel`,
    );
    validateOrThrow(
      validators['task-envelope.schema.json'],
      task,
      selected.sourceTaskId,
    );
    validateOrThrow(
      validateCapsule,
      task.sourceObservation.channels.ugp.representation.capsule,
      `${selected.sourceTaskId} UGP capsule`,
    );
    const gold = {
      schemaVersion: '0.3.0',
      taskId: selected.sourceTaskId,
      scorer: { kind: 'normalized-exact-answer', accepted: [targetLabel] },
    };
    validateOrThrow(
      validators['gold.schema.json'],
      gold,
      `${selected.sourceTaskId} gold`,
    );
    const taskPath = join(outputRoot, 'screenpr', 'tasks', `${safeId}.json`);
    const goldPath = join(sealedRoot, 'screenpr', `${safeId}.gold.json`);
    await Promise.all([writeJson(taskPath, task), writeJson(goldPath, gold)]);
    manifestRows.push({
      sourceTaskId: selected.sourceTaskId,
      taskPath,
      goldPath,
      taskDigest: sha256(canonicalJson(task)),
      goldDigest: sha256(canonicalJson(gold)),
    });
  }
  return {
    benchmarkId: 'screenpr-referent',
    selectionDigest: selection.selectionDigest,
    count: manifestRows.length,
    tasks: manifestRows,
  };
}

async function materializeScreenqa() {
  const selection = await readJson(
    join(runsRoot, 'source-data', 'screenqa', 'selection.json'),
  );
  const sourceRows = await readJson(
    join(experimentRoot, 'vendor', 'screenqa', 'short_answers', 'test.json'),
  );
  const combinedRoot = join(ricoRoot, 'combined');
  const manifestRows = [];
  const selectedTasks = args.limit
    ? selection.tasks.slice(0, Number(args.limit))
    : selection.tasks;
  for (const selected of selectedTasks) {
    const source = sourceRows[selected.sourceIndex];
    assert(source, `Missing ScreenQA row ${selected.sourceIndex}`);
    const imagePath = join(combinedRoot, `${selected.imageId}.jpg`);
    const hierarchyPath = join(combinedRoot, `${selected.imageId}.json`);
    const hierarchy = await readJson(hierarchyPath);
    await access(imagePath);
    const nodes = flattenRico(hierarchy?.activity?.root);
    assert(nodes.length > 0, `No visible RICO nodes for ${selected.imageId}`);
    const factKeys = factsForNodes('rico-vh', nodes, [
      `viewport:${hierarchy?.activity?.root?.bounds?.join(',') ?? 'unknown'}`,
    ]);
    const viewportBounds = hierarchy?.activity?.root?.bounds ?? [
      0, 0, 1440, 2560,
    ];
    const viewport = {
      width: Number(viewportBounds[2] - viewportBounds[0]),
      height: Number(viewportBounds[3] - viewportBounds[1]),
    };
    const task = {
      schemaVersion: '0.3.0',
      taskId: selected.sourceTaskId,
      benchmarkId: 'screenqa-visible',
      domain: 'mobile-app',
      taskFamily: `visible-qa:${selected.questionLead}`,
      instruction: source.question,
      step: 1,
      maxSteps: 1,
      allowedActions: ['answer'],
      publicHistory: [],
      sourceObservation: {
        factBundleDigest: sha256(canonicalJson(factKeys)),
        factKeys,
        channels: commonChannels({
          factKeys,
          nodes,
          imagePaths: [resolve(imagePath)],
          viewport,
          selection: null,
          surface: `screenqa/rico/${sha256(String(selected.imageId)).slice(0, 16)}`,
          question: source.question,
          generatedBy: `screenqa-rico-vh-adapter:${selection.sourceRevision}`,
        }),
      },
    };
    validateOrThrow(
      validators['task-envelope.schema.json'],
      task,
      selected.sourceTaskId,
    );
    validateOrThrow(
      validateCapsule,
      task.sourceObservation.channels.ugp.representation.capsule,
      `${selected.sourceTaskId} UGP capsule`,
    );
    const accepted = source.ground_truth.filter(
      (answer) => answer !== '<no answer>',
    );
    const gold = {
      schemaVersion: '0.3.0',
      taskId: selected.sourceTaskId,
      scorer: { kind: 'screenqa-sqa-s-exact', accepted },
    };
    validateOrThrow(
      validators['gold.schema.json'],
      gold,
      `${selected.sourceTaskId} gold`,
    );
    const safeId = selected.sourceTaskId.replaceAll(':', '-');
    const taskPath = join(outputRoot, 'screenqa', 'tasks', `${safeId}.json`);
    const goldPath = join(sealedRoot, 'screenqa', `${safeId}.gold.json`);
    await Promise.all([writeJson(taskPath, task), writeJson(goldPath, gold)]);
    manifestRows.push({
      sourceTaskId: selected.sourceTaskId,
      taskPath,
      goldPath,
      taskDigest: sha256(canonicalJson(task)),
      goldDigest: sha256(canonicalJson(gold)),
    });
  }
  return {
    benchmarkId: 'screenqa-visible',
    selectionDigest: selection.selectionDigest,
    count: manifestRows.length,
    tasks: manifestRows,
  };
}

await mkdir(outputRoot, { recursive: true });
const requested = String(args.benchmark ?? 'all');
const manifests = [];
if (requested === 'all' || requested === 'screenpr') {
  manifests.push(await materializeScreenpr());
}
if (requested === 'all' || requested === 'screenqa') {
  manifests.push(await materializeScreenqa());
}
assert(manifests.length > 0, '--benchmark must be all, screenpr, or screenqa');
for (const manifest of manifests) {
  manifest.materializer = 'static-task-materializer-v1';
  manifest.manifestDigest = sha256(canonicalJson(manifest.tasks));
  await writeJson(
    join(outputRoot, manifest.benchmarkId, 'manifest.json'),
    manifest,
  );
}
console.log(
  JSON.stringify(
    manifests.map(({ benchmarkId, count, manifestDigest }) => ({
      benchmarkId,
      count,
      manifestDigest,
    })),
  ),
);
