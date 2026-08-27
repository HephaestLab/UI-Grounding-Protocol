import type {
  Anchor,
  GroundingBundle,
  ResolvedReferent,
  Selection,
  SemanticNode,
} from '@ui-grounding/protocol';

export function node(
  nodeId: string,
  overrides: Partial<SemanticNode> = {},
): SemanticNode {
  return {
    nodeId,
    type: 'org.example.analytics.metric',
    label: nodeId,
    authority: 'authoritative',
    entityRef: { namespace: 'analytics', id: nodeId },
    anchorIds: [`anchor:${nodeId}`],
    revision: '1',
    ...overrides,
  };
}

export function rectAnchor(
  nodeId: string,
  x = 0,
  y = 0,
  width = 100,
  height = 100,
  overrides: Partial<Extract<Anchor, { kind: 'dom' }>> = {},
): Anchor {
  return {
    anchorId: `anchor:${nodeId}`,
    nodeId,
    kind: 'dom',
    surfaceRevision: '1',
    visibility: 'visible',
    selector: { type: 'CssSelector', value: `#${nodeId}` },
    geometry: {
      kind: 'rect',
      coordinateSpace: 'viewport',
      x,
      y,
      width,
      height,
    },
    ...overrides,
  };
}

export function pointSelection(
  x = 10,
  y = 10,
  overrides: Omit<Partial<Selection>, 'geometry'> & {
    geometry?: Selection['geometry'] | undefined;
  } = {},
): Selection {
  const selection = {
    selectionId: 'selection:1',
    surfaceId: 'surface:1',
    mode: 'point',
    selectors: [
      {
        type: 'UGPGeometrySelector',
        geometry: { kind: 'point', coordinateSpace: 'viewport', x, y },
      },
    ],
    geometry: { kind: 'point', coordinateSpace: 'viewport', x, y },
    surfaceRevision: '1',
    createdAt: '2026-08-27T12:00:00Z',
    source: 'human',
    ...overrides,
  };
  if (selection.geometry === undefined) {
    delete (selection as { geometry?: unknown }).geometry;
  }
  return selection as Selection;
}

export function grounding(referents: ResolvedReferent[]): GroundingBundle {
  return {
    groundingId: 'grounding:1',
    selection: pointSelection() as unknown as GroundingBundle['selection'],
    referents: referents as GroundingBundle['referents'],
    generatedAt: '2026-08-27T12:00:00Z',
  };
}

export function referent(
  nodeId: string,
  overrides: Partial<ResolvedReferent> = {},
): ResolvedReferent {
  return {
    nodeId,
    type: 'org.example.analytics.metric',
    label: nodeId,
    authority: 'authoritative',
    confidence: 1,
    relation: 'exact',
    evidence: [
      {
        kind: 'anchor-hit',
        authority: 'authoritative',
        anchorId: `anchor:${nodeId}`,
      },
    ],
    surfaceRevision: '1',
    nodeRevision: '1',
    ...overrides,
  };
}
