import type { Anchor } from '@ui-grounding/protocol';
import { describe, expect, it } from 'vitest';

import { SemanticRegistry } from './registry.js';
import { resolveSelection } from './resolver.js';
import { node, pointSelection, rectAnchor } from './test-fixtures.js';

function registryWith(
  nodes: ReturnType<typeof node>[],
  anchors: Anchor[],
): SemanticRegistry {
  const registry = new SemanticRegistry({
    surfaceId: 'surface:1',
    surfaceRevision: '1',
  });
  for (const value of nodes) registry.registerNode(value);
  for (const value of anchors) registry.registerAnchor(value);
  return registry;
}

describe('resolveSelection', () => {
  it('fails closed for a stale or mismatched Surface', () => {
    const registry = registryWith([node('metric')], [rectAnchor('metric')]);
    const stale = resolveSelection(
      registry.getSnapshot(),
      pointSelection(10, 10, { surfaceRevision: '0' }),
    );
    expect(stale.referents).toEqual([]);
    expect(stale.problem?.code).toBe('SURFACE_STALE');
    expect(stale.problem?.retryable).toBe(true);

    const wrongSurface = resolveSelection(
      registry.getSnapshot(),
      pointSelection(10, 10, { surfaceId: 'surface:other' }),
    );
    expect(wrongSurface.problem?.code).toBe('SURFACE_STALE');
  });

  it('resolves semantic selectors without geometry', () => {
    const registry = registryWith(
      [
        node('revenue', {
          type: 'org.example.analytics.metric',
          entityRef: { namespace: 'analytics', id: 'revenue' },
        }),
        node('cost', {
          type: 'org.example.analytics.metric',
          entityRef: { namespace: 'analytics', id: 'cost' },
        }),
      ],
      [],
    );
    const byNode = pointSelection(0, 0, {
      mode: 'semantic',
      geometry: undefined,
      selectors: [{ type: 'UGPSemanticSelector', nodeId: 'revenue' }],
    });
    const result = resolveSelection(registry.getSnapshot(), byNode);
    expect(result.referents.map((item) => item.nodeId)).toEqual(['revenue']);
    expect(result.referents[0]?.evidence[0]?.kind).toBe('semantic-selector');

    const byEntity = resolveSelection(
      registry.getSnapshot(),
      pointSelection(0, 0, {
        mode: 'semantic',
        geometry: undefined,
        selectors: [
          {
            type: 'UGPSemanticSelector',
            entityRef: { namespace: 'analytics', id: 'cost' },
          },
        ],
      }),
    );
    expect(byEntity.referents[0]?.nodeId).toBe('cost');

    const byType = resolveSelection(
      registry.getSnapshot(),
      pointSelection(0, 0, {
        mode: 'semantic',
        geometry: undefined,
        selectors: [
          {
            type: 'UGPSemanticSelector',
            semanticType: 'org.example.analytics.metric',
          },
        ],
      }),
    );
    expect(byType.referents).toHaveLength(2);
    expect(byType.ambiguity?.requiresDisambiguation).toBe(true);
  });

  it('orders point hits and makes equal business candidates ambiguous', () => {
    const registry = registryWith(
      [node('derived', { authority: 'derived' }), node('high'), node('low')],
      [
        rectAnchor('derived', 0, 0, 100, 100, { priority: 100 }),
        rectAnchor('high', 0, 0, 100, 100, { priority: 10 }),
        rectAnchor('low', 0, 0, 100, 100, { priority: 0 }),
      ],
    );
    const result = resolveSelection(registry.getSnapshot(), pointSelection());
    expect(result.referents.map((item) => item.nodeId)).toEqual([
      'high',
      'low',
      'derived',
    ]);
    expect(result.ambiguity?.requiresDisambiguation).toBe(false);

    const tie = registryWith(
      [node('a'), node('b')],
      [rectAnchor('a'), rectAnchor('b')],
    );
    const ambiguous = resolveSelection(tie.getSnapshot(), pointSelection());
    expect(ambiguous.problem?.code).toBe('AMBIGUOUS_REFERENT');
    expect(ambiguous.ambiguity?.candidates).toHaveLength(2);
  });

  it('rejects invisible, occluded, stale, expired, and orphan anchors', () => {
    const nodes = [
      node('offscreen'),
      node('occluded'),
      node('stale'),
      node('expired'),
      node('expired-node', { expiresAt: '2026-08-27T11:59:59Z' }),
      node('future-node', { validAt: '2026-08-27T12:00:01Z' }),
    ];
    const anchors: Anchor[] = [
      rectAnchor('offscreen', 0, 0, 10, 10, { visibility: 'offscreen' }),
      rectAnchor('occluded', 0, 0, 10, 10, { visibility: 'occluded' }),
      rectAnchor('stale', 0, 0, 10, 10, { surfaceRevision: '0' }),
      {
        anchorId: 'anchor:expired',
        nodeId: 'expired',
        kind: 'canvas',
        surfaceRevision: '1',
        adapterId: 'adapter:1',
        expiresAt: '2026-08-27T11:59:59Z',
        geometry: {
          kind: 'rect',
          coordinateSpace: 'viewport',
          x: 0,
          y: 0,
          width: 10,
          height: 10,
        },
      },
      rectAnchor('expired-node'),
      rectAnchor('future-node'),
    ];
    const registry = registryWith(nodes, anchors);
    const snapshot = registry.getSnapshot();
    const result = resolveSelection(
      { ...snapshot, anchors: [...snapshot.anchors, rectAnchor('orphan')] },
      pointSelection(),
    );
    expect(result.problem?.code).toBe('NO_REFERENT');
    expect(result.omitted).toEqual(
      expect.arrayContaining([
        { nodeId: 'offscreen', reason: 'invisible' },
        { nodeId: 'occluded', reason: 'occluded' },
        { nodeId: 'stale', reason: 'stale' },
        { nodeId: 'expired', reason: 'stale' },
        { nodeId: 'expired-node', reason: 'stale' },
        { nodeId: 'future-node', reason: 'stale' },
      ]),
    );

    const staleSemantic = resolveSelection(
      snapshot,
      pointSelection(0, 0, {
        mode: 'semantic',
        geometry: undefined,
        selectors: [{ type: 'UGPSemanticSelector', nodeId: 'expired-node' }],
      }),
    );
    expect(staleSemantic.referents).toEqual([]);
    expect(staleSemantic.omitted).toContainEqual({
      nodeId: 'expired-node',
      reason: 'stale',
    });
  });

  it('resolves text with quote, position, or both', () => {
    const textAnchor: Anchor = {
      anchorId: 'anchor:insight',
      nodeId: 'insight',
      kind: 'text',
      surfaceRevision: '1',
      selectors: [
        { type: 'TextQuoteSelector', exact: 'Revenue increased' },
        { type: 'TextPositionSelector', start: 10, end: 27 },
      ],
    };
    const registry = registryWith([node('insight')], [textAnchor]);
    const selection = pointSelection(0, 0, {
      mode: 'text',
      geometry: undefined,
      selectors: [
        { type: 'TextQuoteSelector', exact: 'Revenue' },
        { type: 'TextPositionSelector', start: 10, end: 17 },
      ],
    });
    const exact = resolveSelection(registry.getSnapshot(), selection);
    expect(exact.referents[0]?.relation).toBe('text-overlap');
    expect(exact.referents[0]?.confidence).toBe(1);

    const positionOnly = resolveSelection(registry.getSnapshot(), {
      ...selection,
      selectors: [{ type: 'TextPositionSelector', start: 11, end: 12 }],
    });
    expect(positionOnly.referents[0]?.confidence).toBe(0.75);
    const none = resolveSelection(registry.getSnapshot(), {
      ...selection,
      selectors: [{ type: 'TextQuoteSelector', exact: 'Costs decreased' }],
    });
    expect(none.problem?.code).toBe('NO_REFERENT');
  });

  it('collapses partial point hierarchy to a child and complete regions to a parent', () => {
    const nodes = [
      node('parent'),
      node('child-a', { parentNodeId: 'parent' }),
      node('child-b', { parentNodeId: 'parent' }),
    ];
    const anchors = [
      rectAnchor('parent', 0, 0, 100, 100),
      rectAnchor('child-a', 0, 0, 40, 40),
      rectAnchor('child-b', 60, 60, 40, 40),
    ];
    const registry = registryWith(nodes, anchors);
    const point = resolveSelection(
      registry.getSnapshot(),
      pointSelection(10, 10),
    );
    expect(point.referents.map((item) => item.nodeId)).toEqual(['child-a']);
    expect(point.omitted).toContainEqual({
      nodeId: 'parent',
      reason: 'parent-collapsed',
    });

    const region = pointSelection(0, 0, {
      mode: 'region',
      selectors: [
        {
          type: 'UGPGeometrySelector',
          geometry: {
            kind: 'rect',
            coordinateSpace: 'viewport',
            x: 0,
            y: 0,
            width: 100,
            height: 100,
          },
        },
      ],
      geometry: {
        kind: 'rect',
        coordinateSpace: 'viewport',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      },
    });
    const collapsed = resolveSelection(registry.getSnapshot(), region);
    expect(collapsed.referents.map((item) => item.nodeId)).toEqual(['parent']);
    expect(collapsed.ambiguity?.requiresDisambiguation).toBe(false);
  });

  it('deduplicates multiple views of one entity and retains evidence', () => {
    const registry = registryWith(
      [
        node('view-a', {
          entityRef: { namespace: 'orders', id: '42' },
        }),
        node('view-b', {
          entityRef: { namespace: 'orders', id: '42' },
        }),
      ],
      [rectAnchor('view-a'), rectAnchor('view-b')],
    );
    const result = resolveSelection(registry.getSnapshot(), pointSelection());
    expect(result.referents).toHaveLength(1);
    expect(result.referents[0]?.evidence).toHaveLength(2);
    expect(result.omitted).toContainEqual({
      nodeId: 'view-b',
      reason: 'duplicate',
    });
  });

  it('handles adapter, inferred, point, polygon, and coordinate-space hits', () => {
    const anchors: Anchor[] = [
      {
        anchorId: 'anchor:canvas',
        nodeId: 'canvas',
        kind: 'canvas',
        adapterId: 'adapter:1',
        surfaceRevision: '1',
        geometry: {
          kind: 'point',
          coordinateSpace: 'viewport',
          x: 10,
          y: 10,
        },
      },
      {
        anchorId: 'anchor:a11y',
        nodeId: 'a11y',
        kind: 'accessibility',
        role: 'button',
        name: 'Explain',
        surfaceRevision: '1',
        geometry: {
          kind: 'polygon',
          coordinateSpace: 'viewport',
          points: [
            { x: 0, y: 0 },
            { x: 20, y: 0 },
            { x: 10, y: 20 },
          ],
        },
      },
      rectAnchor('mismatch', 0, 0, 20, 20, {
        geometry: {
          kind: 'rect',
          coordinateSpace: 'surface',
          x: 0,
          y: 0,
          width: 20,
          height: 20,
        },
      }),
    ];
    const registry = registryWith(
      [
        node('canvas'),
        node('a11y', { authority: 'inferred' }),
        node('mismatch'),
      ],
      anchors,
    );
    const result = resolveSelection(registry.getSnapshot(), pointSelection());
    expect(result.referents.map((item) => item.nodeId)).toEqual([
      'canvas',
      'a11y',
    ]);
    expect(result.referents[0]?.evidence[0]?.kind).toBe('adapter-hit');
    expect(result.referents[1]?.evidence[0]?.kind).toBe(
      'accessibility-inference',
    );
  });

  it('merges semantic and anchor evidence and ignores separated regions', () => {
    const registry = registryWith(
      [node('metric'), node('distant')],
      [
        rectAnchor('metric', 0, 0, 20, 20, { priority: 5 }),
        rectAnchor('distant', 100, 100, 10, 10),
      ],
    );
    const selection = pointSelection(0, 0, {
      mode: 'region',
      geometry: {
        kind: 'rect',
        coordinateSpace: 'viewport',
        x: 0,
        y: 0,
        width: 20,
        height: 20,
      },
      selectors: [
        { type: 'UGPSemanticSelector', nodeId: 'metric' },
        {
          type: 'UGPGeometrySelector',
          geometry: {
            kind: 'rect',
            coordinateSpace: 'viewport',
            x: 0,
            y: 0,
            width: 20,
            height: 20,
          },
        },
      ],
    });
    const result = resolveSelection(registry.getSnapshot(), selection);
    expect(result.referents.map((item) => item.nodeId)).toEqual(['metric']);
    expect(result.referents[0]?.evidence).toHaveLength(2);
  });

  it('caps output at twenty and records the limit', () => {
    const nodes = Array.from({ length: 22 }, (_, index) =>
      node(`metric-${String(index).padStart(2, '0')}`),
    );
    const registry = registryWith(nodes, []);
    const selection = pointSelection(0, 0, {
      mode: 'semantic',
      geometry: undefined,
      selectors: [
        {
          type: 'UGPSemanticSelector',
          semanticType: 'org.example.analytics.metric',
        },
      ],
    });
    const result = resolveSelection(registry.getSnapshot(), selection);
    expect(result.referents).toHaveLength(20);
    expect(
      result.omitted?.filter((item) => item.reason === 'limit'),
    ).toHaveLength(2);
  });

  it('is deterministic for one thousand identical executions', () => {
    const registry = registryWith([node('metric')], [rectAnchor('metric')]);
    const snapshot = registry.getSnapshot();
    const selection = pointSelection();
    const expected = JSON.stringify(resolveSelection(snapshot, selection));
    for (let iteration = 0; iteration < 1000; iteration += 1) {
      expect(JSON.stringify(resolveSelection(snapshot, selection))).toBe(
        expected,
      );
    }
  });
});
