import { describe, expect, it, vi } from 'vitest';

import { node, rectAnchor } from './test-fixtures.js';
import { SemanticRegistry } from './registry.js';

describe('SemanticRegistry', () => {
  it('registers, clones, indexes, updates, and unregisters nodes', () => {
    const registry = new SemanticRegistry({
      surfaceId: 'surface:1',
      surfaceRevision: '1',
    });
    const listener = vi.fn();
    const unsubscribe = registry.subscribe(listener);
    const parent = registry.registerNode(
      node('parent', { entityRef: { namespace: 'orders', id: '42' } }),
    );
    const child = registry.registerNode(
      node('child', {
        parentNodeId: 'parent',
        entityRef: { namespace: 'orders', id: '42' },
      }),
    );

    expect(registry.semanticRevision).toBe(2);
    expect(registry.findByEntityRef('orders', '42')).toHaveLength(2);
    expect(registry.getChildren('parent').map((item) => item.nodeId)).toEqual([
      'child',
    ]);
    const original = registry.getNode('parent');
    expect(original?.label).toBe('parent');
    if (original) original.label = 'mutated clone';
    expect(registry.getNode('parent')?.label).toBe('parent');

    parent.update(
      node('parent', {
        label: 'Order 42',
        entityRef: { namespace: 'orders', id: '43' },
      }),
    );
    expect(registry.findByEntityRef('orders', '42')).toHaveLength(1);
    expect(registry.findByEntityRef('orders', '43')[0]?.label).toBe('Order 42');
    child.dispose();
    child.dispose();
    expect(registry.getChildren('parent')).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(4);
    unsubscribe();
    parent.dispose();
    expect(listener).toHaveBeenCalledTimes(4);
  });

  it('registers, updates, aborts, and cascades anchors', () => {
    const registry = new SemanticRegistry({
      surfaceId: 'surface:1',
      surfaceRevision: '1',
    });
    registry.registerNode(node('metric'));
    const controller = new AbortController();
    const registration = registry.registerAnchor(rectAnchor('metric'), {
      signal: controller.signal,
    });
    expect(registry.getAnchor('anchor:metric')?.nodeId).toBe('metric');
    registration.update(rectAnchor('metric', 10, 20, 30, 40, { priority: 5 }));
    expect(registry.getAnchor('anchor:metric')?.priority).toBe(5);
    controller.abort();
    expect(registry.getAnchor('anchor:metric')).toBeUndefined();

    registry.registerAnchor(rectAnchor('metric'));
    expect(registry.unregisterNode('metric')).toBe(true);
    expect(registry.getAnchor('anchor:metric')).toBeUndefined();
    expect(registry.unregisterNode('metric')).toBe(false);
    expect(registry.unregisterAnchor('missing')).toBe(false);
  });

  it('aborts node registrations and rejects duplicate anchors', () => {
    const registry = new SemanticRegistry({
      surfaceId: 'surface:1',
      surfaceRevision: '1',
    });
    expect(registry.surfaceRevision).toBe('1');
    const controller = new AbortController();
    registry.registerNode(node('metric'), { signal: controller.signal });
    registry.registerAnchor(rectAnchor('metric'));
    expect(() => registry.registerAnchor(rectAnchor('metric'))).toThrow(
      'already registered',
    );
    controller.abort();
    expect(registry.getNode('metric')).toBeUndefined();
    expect(registry.getAnchor('anchor:metric')).toBeUndefined();
  });

  it('keeps stable snapshots until mutations and notifies after revisions', () => {
    const registry = new SemanticRegistry({
      surfaceId: 'surface:1',
      surfaceRevision: '1',
    });
    const first = registry.getSnapshot();
    registry.setSurfaceRevision('1');
    expect(registry.getSnapshot()).toBe(first);
    registry.setSurfaceRevision('2');
    const second = registry.getSnapshot();
    expect(second).not.toBe(first);
    expect(second.surfaceRevision).toBe('2');
    expect(second.semanticRevision).toBe(1);
    expect(Object.isFrozen(second.nodes)).toBe(true);
  });

  it('rejects invalid lifecycle operations', () => {
    expect(
      () => new SemanticRegistry({ surfaceId: '', surfaceRevision: '1' }),
    ).toThrow('surfaceId');
    expect(
      () =>
        new SemanticRegistry({ surfaceId: 'surface:1', surfaceRevision: '' }),
    ).toThrow('surfaceRevision');
    const registry = new SemanticRegistry({
      surfaceId: 'surface:1',
      surfaceRevision: '1',
    });
    expect(() =>
      registry.registerNode(node('self', { parentNodeId: 'self' })),
    ).toThrow('own parent');
    registry.registerNode(node('metric'));
    expect(() => registry.registerNode(node('metric'))).toThrow('already');
    expect(() => registry.registerAnchor(rectAnchor('missing'))).toThrow(
      'unknown',
    );
    expect(() => registry.updateNode('missing', node('missing'))).toThrow(
      'Unknown',
    );
    expect(() => registry.updateNode('metric', node('other'))).toThrow(
      'cannot be changed',
    );
    expect(() =>
      registry.updateAnchor('missing', rectAnchor('metric')),
    ).toThrow('Unknown');
    registry.registerAnchor(rectAnchor('metric'));
    expect(() =>
      registry.updateAnchor('anchor:metric', {
        ...rectAnchor('metric'),
        anchorId: 'anchor:other',
      }),
    ).toThrow('cannot be changed');
    expect(() =>
      registry.updateAnchor(
        'anchor:metric',
        rectAnchor('missing', 0, 0, 1, 1, {
          anchorId: 'anchor:metric',
        }),
      ),
    ).toThrow('unknown');
    expect(() => registry.setSurfaceRevision('')).toThrow('surfaceRevision');
  });

  it('supports pre-aborted registration and complete disposal', () => {
    const registry = new SemanticRegistry({
      surfaceId: 'surface:1',
      surfaceRevision: '1',
    });
    const controller = new AbortController();
    controller.abort();
    expect(() =>
      registry.registerNode(node('metric'), { signal: controller.signal }),
    ).toThrowError(DOMException);
    registry.registerNode(node('metric'));
    expect(() =>
      registry.registerAnchor(rectAnchor('metric'), {
        signal: controller.signal,
      }),
    ).toThrowError(DOMException);
    registry.dispose();
    registry.dispose();
    expect(() => registry.registerNode(node('other'))).toThrow('disposed');
    expect(() => registry.subscribe(() => undefined)).toThrow('disposed');
  });

  it('rejects updates through disposed handles', () => {
    const registry = new SemanticRegistry({
      surfaceId: 'surface:1',
      surfaceRevision: '1',
    });
    const handle = registry.registerNode(node('metric'));
    handle.dispose();
    expect(() => handle.update(node('metric'))).toThrow('disposed');

    registry.registerNode(node('other'));
    const anchor = registry.registerAnchor(rectAnchor('other'));
    anchor.dispose();
    expect(() => anchor.update(rectAnchor('other'))).toThrow('disposed');
  });
});
