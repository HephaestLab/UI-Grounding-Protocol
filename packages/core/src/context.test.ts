import type { SemanticNode } from '@ui-grounding/protocol';
import { describe, expect, it, vi } from 'vitest';

import { ContextRegistry } from './context.js';
import { grounding, referent } from './test-fixtures.js';

type Descriptor = NonNullable<SemanticNode['contextDescriptors']>[number];

const summary: Descriptor = {
  name: 'summary',
  description: 'A concise metric summary.',
  schema: { type: 'object' },
  sensitivity: 'internal',
  freshness: 'on-demand',
  maxAgeMs: 1000,
  estimatedBytes: 128,
};

const fixedTime = new Date('2026-08-27T12:00:00Z');

describe('ContextRegistry', () => {
  it('authorizes before materializing and emits freshness and budget metadata', async () => {
    const registry = new ContextRegistry({ clock: () => fixedTime });
    const calls: string[] = [];
    registry.register('metric', summary, ({ principalRef, purpose }) => {
      calls.push(`materialize:${principalRef}:${purpose}`);
      return { value: 42 };
    });
    const bundle = await registry.materialize({
      grounding: grounding([
        referent('metric', {
          entityRef: { namespace: 'analytics', id: 'metric' },
        }),
      ]),
      principalRef: 'user:analyst',
      purpose: 'explain',
      budgetBytes: 1024,
      signal: new AbortController().signal,
      authorize: ({ descriptor }) => {
        calls.push(`authorize:${descriptor.name}`);
        return true;
      },
    });

    expect(calls).toEqual([
      'authorize:summary',
      'materialize:user:analyst:explain',
    ]);
    expect(bundle.referentContexts[0]).toMatchObject({
      nodeId: 'metric',
      contexts: { summary: { value: 42 } },
      freshness: {
        generatedAt: '2026-08-27T12:00:00.000Z',
        validUntil: '2026-08-27T12:00:01.000Z',
      },
    });
    expect(bundle.budget.emittedBytes).toBeGreaterThan(0);
    expect(bundle.budget.emittedBytes).toBeLessThanOrEqual(1024);
    expect(bundle.authorization).toEqual({
      principalRef: 'user:analyst',
      purpose: 'explain',
      filtered: false,
    });
  });

  it('omits unauthorized context without calling its provider', async () => {
    const registry = new ContextRegistry({ clock: () => fixedTime });
    const materialize = vi.fn(() => ({ secret: true }));
    registry.register('metric', summary, materialize);
    const bundle = await registry.materialize({
      grounding: grounding([referent('metric')]),
      purpose: 'inspect',
      budgetBytes: 1024,
      signal: new AbortController().signal,
      authorize: () => false,
    });
    expect(materialize).not.toHaveBeenCalled();
    expect(bundle.authorization.filtered).toBe(true);
    expect(bundle.referentContexts[0]?.omitted).toContainEqual({
      name: 'summary',
      reason: 'unauthorized',
    });
  });

  it('enforces budget after authorization and marks truncation', async () => {
    const registry = new ContextRegistry({ clock: () => fixedTime });
    registry.register('metric', summary, () => ({ text: 'x'.repeat(100) }));
    const bundle = await registry.materialize({
      grounding: grounding([referent('metric')]),
      purpose: 'inspect',
      budgetBytes: 10,
      signal: new AbortController().signal,
      authorize: () => true,
    });
    expect(bundle.budget).toEqual({
      requestedBytes: 10,
      emittedBytes: 0,
      truncated: true,
    });
    expect(bundle.referentContexts[0]?.omitted).toContainEqual({
      name: 'summary',
      reason: 'budget',
    });
  });

  it('omits stale, failed, cyclic, and validator-rejected values', async () => {
    const registry = new ContextRegistry({ clock: () => fixedTime });
    registry.register('stale', summary, () => ({ value: 1 }), {
      nodeRevision: '2',
    });
    registry.register('failed', summary, () => {
      throw new Error('provider failed');
    });
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    registry.register('cyclic', summary, () => cyclic);
    registry.register('invalid', summary, () => ({ value: 'wrong' }), {
      validate: () => false,
    });
    const bundle = await registry.materialize({
      grounding: grounding([
        referent('stale', { nodeRevision: '1' }),
        referent('failed'),
        referent('cyclic'),
        referent('invalid'),
      ]),
      purpose: 'inspect',
      budgetBytes: 1024,
      signal: new AbortController().signal,
      authorize: () => true,
    });
    expect(
      bundle.referentContexts.map((item) => item.omitted?.[0]?.reason),
    ).toEqual(['stale', 'unavailable', 'unavailable', 'unavailable']);
  });

  it('filters requested contexts and materializes in lexical order', async () => {
    const registry = new ContextRegistry({ clock: () => fixedTime });
    const order: string[] = [];
    registry.register('metric', { ...summary, name: 'zeta' }, () => {
      order.push('zeta');
      return 2;
    });
    registry.register('metric', { ...summary, name: 'alpha' }, () => {
      order.push('alpha');
      return 1;
    });
    const bundle = await registry.materialize({
      grounding: grounding([referent('metric')]),
      purpose: 'compare',
      requestedContexts: ['zeta', 'alpha'],
      budgetBytes: 1024,
      signal: new AbortController().signal,
      authorize: () => true,
    });
    expect(order).toEqual(['alpha', 'zeta']);
    expect(bundle.referentContexts[0]?.contexts).toEqual({ alpha: 1, zeta: 2 });
    expect(bundle.contextId).toContain('alpha,zeta');

    const filtered = await registry.materialize({
      grounding: grounding([referent('metric')]),
      purpose: 'compare',
      requestedContexts: ['alpha'],
      budgetBytes: 1024,
      signal: new AbortController().signal,
      authorize: () => true,
    });
    expect(filtered.referentContexts[0]?.contexts).toEqual({ alpha: 1 });
  });

  it('supports cancellation before and during materialization', async () => {
    const registry = new ContextRegistry();
    registry.register('metric', summary, ({ signal }) => {
      expect(signal.aborted).toBe(false);
      return { value: 1 };
    });
    const before = new AbortController();
    before.abort();
    await expect(
      registry.materialize({
        grounding: grounding([referent('metric')]),
        purpose: 'inspect',
        budgetBytes: 1024,
        signal: before.signal,
        authorize: () => true,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });

    const during = new AbortController();
    await expect(
      registry.materialize({
        grounding: grounding([referent('metric')]),
        purpose: 'inspect',
        budgetBytes: 1024,
        signal: during.signal,
        authorize: () => {
          during.abort();
          return true;
        },
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('validates registration and lifecycle operations', async () => {
    const registry = new ContextRegistry({ clock: () => fixedTime });
    expect(() => registry.register('', summary, () => 1)).toThrow('nodeId');
    const aborted = new AbortController();
    aborted.abort();
    expect(() =>
      registry.register('metric', summary, () => 1, {
        signal: aborted.signal,
      }),
    ).toThrowError(DOMException);
    const controller = new AbortController();
    const dispose = registry.register('metric', summary, () => 1, {
      signal: controller.signal,
    });
    expect(() => registry.register('metric', summary, () => 2)).toThrow(
      'already',
    );
    controller.abort();
    dispose();

    await expect(
      registry.materialize({
        grounding: grounding([referent('metric')]),
        purpose: 'inspect',
        budgetBytes: -1,
        signal: new AbortController().signal,
        authorize: () => true,
      }),
    ).rejects.toThrow('budgetBytes');
    registry.dispose();
    registry.dispose();
    expect(() => registry.register('metric', summary, () => 1)).toThrow(
      'disposed',
    );
    await expect(
      registry.materialize({
        grounding: grounding([]),
        purpose: 'inspect',
        budgetBytes: 0,
        signal: new AbortController().signal,
        authorize: () => true,
      }),
    ).rejects.toThrow('disposed');
  });

  it('returns an empty deterministic bundle when no provider is registered', async () => {
    const registry = new ContextRegistry({ clock: () => fixedTime });
    const bundle = await registry.materialize({
      grounding: grounding([referent('missing')]),
      purpose: 'inspect',
      budgetBytes: 0,
      signal: new AbortController().signal,
      authorize: () => true,
    });
    expect(bundle.referentContexts).toEqual([]);
    expect(bundle.contextId).toBe('context:grounding:1:default');
  });

  it('removes active abort listeners during registry disposal', () => {
    const registry = new ContextRegistry({ clock: () => fixedTime });
    const controller = new AbortController();
    registry.register('metric', summary, () => 1, {
      signal: controller.signal,
    });
    registry.dispose();
    controller.abort();
  });

  it('supports contexts without an expiry and skips unrequested providers', async () => {
    const registry = new ContextRegistry({ clock: () => fixedTime });
    const timeless = structuredClone(summary);
    delete timeless.maxAgeMs;
    registry.register('metric', timeless, () => 1);
    const emitted = await registry.materialize({
      grounding: grounding([referent('metric')]),
      purpose: 'inspect',
      budgetBytes: 1024,
      signal: new AbortController().signal,
      authorize: () => true,
    });
    expect(emitted.referentContexts[0]?.freshness.validUntil).toBeUndefined();

    const skipped = await registry.materialize({
      grounding: grounding([referent('metric')]),
      purpose: 'inspect',
      requestedContexts: ['different'],
      budgetBytes: 1024,
      signal: new AbortController().signal,
      authorize: () => true,
    });
    expect(skipped.referentContexts).toEqual([]);
  });
});
