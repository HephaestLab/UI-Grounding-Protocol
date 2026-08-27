import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
  ContextRegistry,
  SemanticRegistry,
  resolveSelection,
} from '@ui-grounding/core';
import type {
  Anchor,
  GroundingBundle,
  Selection,
  SemanticNode,
} from '@ui-grounding/protocol';

interface CompactNode extends Partial<Omit<SemanticNode, 'nodeId'>> {
  nodeId: string;
}

interface CompactAnchor {
  nodeId: string;
  kind?: 'canvas' | 'text';
  point?: [number, number];
  rect?: [number, number, number, number];
  priority?: number;
  visibility?: Anchor['visibility'];
  surfaceRevision?: string;
  expiresAt?: string;
  quote?: string;
  position?: [number, number];
}

interface CompactSelection {
  mode: Selection['mode'];
  point?: [number, number];
  rect?: [number, number, number, number];
  quote?: string;
  position?: [number, number];
  nodeId?: string;
  surfaceId?: string;
  surfaceRevision?: string;
}

interface ResolutionFixture {
  id: string;
  profiles: string[];
  nodes: CompactNode[];
  anchors: CompactAnchor[];
  selection: CompactSelection;
  repeat?: number;
  expected: {
    referentIds: string[];
    problemCode?: string;
    ambiguity?: boolean;
    omittedReasons?: string[];
  };
}

interface ContextFixture {
  id: string;
  profiles: string[];
  authorized: boolean;
  budgetBytes: number;
  value: unknown;
  expected: {
    omittedReason?: string;
    truncated: boolean;
    materializerCalls: number;
  };
}

interface CoreFixtureSuite {
  suiteVersion: '0.1';
  resolution: ResolutionFixture[];
  context: ContextFixture[];
}

export interface CoreConformanceCaseResult {
  id: string;
  profiles: string[];
  passed: boolean;
  detail: string;
}

export interface CoreConformanceReport {
  generatedAt: string;
  profile: 'UGP Core/Profile v0.1';
  summary: { total: number; passed: number; failed: number };
  cases: CoreConformanceCaseResult[];
}

const createdAt = '2026-08-27T12:00:00.000Z';

function toNode(value: CompactNode): SemanticNode {
  return {
    nodeId: value.nodeId,
    type: value.type ?? 'org.example.analytics.metric',
    label: value.label ?? value.nodeId,
    authority: value.authority ?? 'authoritative',
    anchorIds: value.anchorIds ?? [`anchor:${value.nodeId}`],
    ...(value.entityRef ? { entityRef: value.entityRef } : {}),
    ...(value.parentNodeId ? { parentNodeId: value.parentNodeId } : {}),
    ...(value.revision ? { revision: value.revision } : {}),
    ...(value.validAt ? { validAt: value.validAt } : {}),
    ...(value.expiresAt ? { expiresAt: value.expiresAt } : {}),
  };
}

function geometry(value: CompactAnchor): Anchor['geometry'] {
  if (value.point) {
    return {
      kind: 'point',
      coordinateSpace: 'viewport',
      x: value.point[0],
      y: value.point[1],
    };
  }
  if (value.rect) {
    return {
      kind: 'rect',
      coordinateSpace: 'viewport',
      x: value.rect[0],
      y: value.rect[1],
      width: value.rect[2],
      height: value.rect[3],
    };
  }
  return undefined;
}

function toAnchor(value: CompactAnchor): Anchor {
  const common = {
    anchorId: `anchor:${value.nodeId}`,
    nodeId: value.nodeId,
    surfaceRevision: value.surfaceRevision ?? '1',
    ...(value.priority === undefined ? {} : { priority: value.priority }),
    ...(value.visibility ? { visibility: value.visibility } : {}),
  };
  if (value.kind === 'text') {
    const textSelectors = [] as unknown as Extract<
      Anchor,
      { kind: 'text' }
    >['selectors'];
    if (value.quote)
      textSelectors.push({ type: 'TextQuoteSelector', exact: value.quote });
    if (value.position)
      textSelectors.push({
        type: 'TextPositionSelector',
        start: value.position[0],
        end: value.position[1],
      });
    return { ...common, kind: 'text', selectors: textSelectors };
  }
  const anchorGeometry = geometry(value);
  if (!anchorGeometry) throw new Error(`Geometry required for ${value.nodeId}`);
  return {
    ...common,
    kind: 'canvas',
    adapterId: 'conformance-adapter',
    geometry: anchorGeometry,
    ...(value.expiresAt ? { expiresAt: value.expiresAt } : {}),
  };
}

function toSelection(value: CompactSelection, fixtureId: string): Selection {
  const selectors: Selection['selectors'] =
    [] as unknown as Selection['selectors'];
  let selectionGeometry: Selection['geometry'];
  if (value.point) {
    selectionGeometry = {
      kind: 'point',
      coordinateSpace: 'viewport',
      x: value.point[0],
      y: value.point[1],
    };
  } else if (value.rect) {
    selectionGeometry = {
      kind: 'rect',
      coordinateSpace: 'viewport',
      x: value.rect[0],
      y: value.rect[1],
      width: value.rect[2],
      height: value.rect[3],
    };
  }
  if (selectionGeometry) {
    selectors.push({
      type: 'UGPGeometrySelector',
      geometry: selectionGeometry,
    });
  }
  if (value.quote)
    selectors.push({ type: 'TextQuoteSelector', exact: value.quote });
  if (value.position)
    selectors.push({
      type: 'TextPositionSelector',
      start: value.position[0],
      end: value.position[1],
    });
  if (value.nodeId)
    selectors.push({ type: 'UGPSemanticSelector', nodeId: value.nodeId });
  return {
    selectionId: `selection:${fixtureId}`,
    surfaceId: value.surfaceId ?? 'surface:conformance',
    mode: value.mode,
    selectors,
    ...(selectionGeometry ? { geometry: selectionGeometry } : {}),
    surfaceRevision: value.surfaceRevision ?? '1',
    createdAt,
    source: 'human',
  };
}

function runResolutionFixture(
  fixture: ResolutionFixture,
): CoreConformanceCaseResult {
  const registry = new SemanticRegistry({
    surfaceId: 'surface:conformance',
    surfaceRevision: '1',
  });
  for (const node of fixture.nodes) registry.registerNode(toNode(node));
  for (const anchor of fixture.anchors)
    registry.registerAnchor(toAnchor(anchor));
  const selection = toSelection(fixture.selection, fixture.id);
  const result = resolveSelection(registry.getSnapshot(), selection);
  const referentIds = result.referents.map((referent) => referent.nodeId);
  const omittedReasons = (result.omitted ?? [])
    .map((item) => item.reason)
    .sort();
  const expectedOmitted = [...(fixture.expected.omittedReasons ?? [])].sort();
  const deterministic = JSON.stringify(result);
  let repeatPassed = true;
  for (let iteration = 1; iteration < (fixture.repeat ?? 1); iteration += 1) {
    if (
      JSON.stringify(resolveSelection(registry.getSnapshot(), selection)) !==
      deterministic
    ) {
      repeatPassed = false;
      break;
    }
  }
  const passed =
    JSON.stringify(referentIds) ===
      JSON.stringify(fixture.expected.referentIds) &&
    result.problem?.code === fixture.expected.problemCode &&
    (fixture.expected.ambiguity === undefined ||
      result.ambiguity?.requiresDisambiguation ===
        fixture.expected.ambiguity) &&
    JSON.stringify(omittedReasons) === JSON.stringify(expectedOmitted) &&
    repeatPassed;
  registry.dispose();
  return {
    id: fixture.id,
    profiles: fixture.profiles,
    passed,
    detail: passed
      ? `Resolved [${referentIds.join(', ')}] deterministically.`
      : `Expected ${JSON.stringify(fixture.expected)}, received ${JSON.stringify({ referentIds, problemCode: result.problem?.code, ambiguity: result.ambiguity?.requiresDisambiguation, omittedReasons, repeatPassed })}.`,
  };
}

async function runContextFixture(
  fixture: ContextFixture,
): Promise<CoreConformanceCaseResult> {
  const registry = new ContextRegistry({ clock: () => new Date(createdAt) });
  let materializerCalls = 0;
  registry.register(
    'metric',
    {
      name: 'summary',
      description: 'Conformance context.',
      schema: {},
      sensitivity: 'internal',
      freshness: 'on-demand',
    },
    () => {
      materializerCalls += 1;
      return fixture.value;
    },
  );
  const grounding = {
    groundingId: `grounding:${fixture.id}`,
    selection: toSelection(
      { mode: 'semantic', nodeId: 'metric' },
      fixture.id,
    ) as GroundingBundle['selection'],
    referents: [
      {
        nodeId: 'metric',
        type: 'org.example.analytics.metric',
        label: 'metric',
        authority: 'authoritative',
        confidence: 1,
        relation: 'exact',
        evidence: [
          { kind: 'semantic-selector', authority: 'authoritative', score: 1 },
        ],
        surfaceRevision: '1',
      },
    ],
    generatedAt: createdAt,
  } as GroundingBundle;
  const bundle = await registry.materialize({
    grounding,
    purpose: 'conformance',
    budgetBytes: fixture.budgetBytes,
    signal: new AbortController().signal,
    authorize: () => fixture.authorized,
  });
  const omittedReason = bundle.referentContexts[0]?.omitted?.[0]?.reason;
  const passed =
    omittedReason === fixture.expected.omittedReason &&
    bundle.budget.truncated === fixture.expected.truncated &&
    materializerCalls === fixture.expected.materializerCalls;
  registry.dispose();
  return {
    id: fixture.id,
    profiles: fixture.profiles,
    passed,
    detail: passed
      ? `Context policy produced ${omittedReason ?? 'an emitted value'}.`
      : `Expected ${JSON.stringify(fixture.expected)}, received ${JSON.stringify({ omittedReason, truncated: bundle.budget.truncated, materializerCalls })}.`,
  };
}

export async function runCoreConformance(options: {
  workspaceRoot: string;
  writeReports?: boolean;
}): Promise<CoreConformanceReport> {
  const fixturePath = resolve(
    options.workspaceRoot,
    'conformance/fixtures/core-profile-v0.1.json',
  );
  const suite = JSON.parse(
    await readFile(fixturePath, 'utf8'),
  ) as CoreFixtureSuite;
  if (suite.suiteVersion !== '0.1')
    throw new Error('Unsupported Core fixture version');
  const cases = [
    ...suite.resolution.map(runResolutionFixture),
    ...(await Promise.all(suite.context.map(runContextFixture))),
  ];
  const report: CoreConformanceReport = {
    generatedAt: new Date().toISOString(),
    profile: 'UGP Core/Profile v0.1',
    summary: {
      total: cases.length,
      passed: cases.filter((item) => item.passed).length,
      failed: cases.filter((item) => !item.passed).length,
    },
    cases,
  };
  if (options.writeReports) {
    const reportRoot = resolve(options.workspaceRoot, 'conformance/reports');
    await mkdir(reportRoot, { recursive: true });
    await writeFile(
      resolve(reportRoot, 'core-profile-v0.1.json'),
      `${JSON.stringify(report, null, 2)}\n`,
    );
    await writeFile(
      resolve(reportRoot, 'core-profile-v0.1.md'),
      [
        '# UGP Core/Profile v0.1 Conformance Report',
        '',
        `Passed ${report.summary.passed}/${report.summary.total} fixtures.`,
        '',
        '| Result | Fixture | Profiles | Detail |',
        '| --- | --- | --- | --- |',
        ...cases.map(
          (item) =>
            `| ${item.passed ? 'PASS' : 'FAIL'} | ${item.id} | ${item.profiles.join(', ')} | ${item.detail} |`,
        ),
        '',
      ].join('\n'),
    );
  }
  return report;
}
