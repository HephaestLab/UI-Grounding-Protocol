import {
  defineBinding,
  defineProfile,
  type GroundingCapsule,
} from '@ui-grounding/authoring';
import { GroundingInspector } from '@ui-grounding/inspector';
import type { Selection } from '@ui-grounding/protocol';
import {
  GroundingSurfaceProvider,
  useGroundingRuntime,
  useUgpLink,
  type GroundingRuntime,
} from '@ui-grounding/react';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

const commerceProfile = defineProfile({
  profileId: 'profile:commerce',
  version: '1',
  title: 'Commerce',
  frames: [
    {
      type: 'commerce.order',
      title: 'Order',
      description: 'A commerce order and its current business state.',
      roles: {
        state: { description: 'Current order state', valueKinds: ['string'] },
        total: { description: 'Order total', valueKinds: ['quantity'] },
      },
      requiredRoles: ['state', 'total'],
      summaryTemplate: '{subject} is {state} with total {total}.',
      capabilities: ['commerce.inspect-order'],
    },
  ],
});

const orderBinding = defineBinding<{
  id: string;
  state: string;
  total: number;
  revision: string;
}>({
  bindingId: 'binding:order-row',
  profile: 'profile:commerce',
  frameType: 'commerce.order',
  nodeId: (order) => `order:${order.id}`,
  subject: (order) => ({
    kind: 'entity',
    ref: `orders/${order.id}`,
    type: 'commerce.order',
    label: `Order ${order.id}`,
  }),
  roles: (order) => ({
    state: order.state,
    total: { kind: 'quantity', value: order.total, unit: 'USD' },
  }),
  revision: (order) => order.revision,
  capabilities: ['commerce.inspect-order'],
});

async function until(assertion: () => void): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise<void>((done) => requestAnimationFrame(() => done()));
    }
  }
  throw lastError;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('UGP v0.2 optional Inspector', () => {
  it('hands a compact structured Capsule from a minimally linked component to the host app', async () => {
    const mount = document.createElement('div');
    document.body.append(mount);
    let runtime: GroundingRuntime | undefined;

    function OrderRow() {
      runtime = useGroundingRuntime();
      const link = useUgpLink(orderBinding, {
        id: '42',
        state: 'pending-payment',
        total: 8431,
        revision: 'order-r3',
      });
      return createElement('button', { ref: link.ref }, 'Order 42');
    }

    const root = createRoot(mount);
    root.render(
      createElement(
        GroundingSurfaceProvider,
        {
          surfaceId: 'surface:orders',
          surfaceRevision: 'surface-r1',
          profiles: [commerceProfile],
        },
        createElement(OrderRow),
      ),
    );
    await until(() => {
      expect(runtime?.registry.getNode('order:42')).toBeDefined();
      expect(runtime?.registry.getSnapshot().anchors).toHaveLength(1);
    });

    const delivered: GroundingCapsule[] = [];
    const inspector = new GroundingInspector({
      registry: runtime!.registry,
      descriptions: runtime!.descriptionRegistry,
      onGrounding: (capsule) => delivered.push(capsule),
    });
    const selection: Selection = {
      selectionId: 'selection:order-42',
      surfaceId: 'surface:orders',
      mode: 'semantic',
      selectors: [{ type: 'UGPSemanticSelector', nodeId: 'order:42' }],
      surfaceRevision: 'surface-r1',
      createdAt: new Date().toISOString(),
      source: 'human',
    };
    const capsule = inspector.inspect(selection);

    expect(capsule.description?.summary).toBe(
      'Order 42 is pending-payment with total 8431 USD.',
    );
    expect(capsule.description?.frame.roles).toMatchObject({
      state: 'pending-payment',
      total: { kind: 'quantity', value: 8431, unit: 'USD' },
    });
    expect(capsule.can).toEqual(['commerce.inspect-order']);
    expect(delivered).toEqual([capsule]);
    expect(document.querySelector('.ugp-inspector-summary')?.textContent).toBe(
      capsule.description?.summary,
    );
    expect(
      document.querySelector('.ugp-inspector-panel pre')?.textContent,
    ).not.toContain('selectors');

    inspector.setMode('region');
    expect(
      document
        .querySelector<HTMLButtonElement>('[data-mode="region"]')
        ?.getAttribute('aria-pressed'),
    ).toBe('true');
    inspector.dispose();
    root.unmount();
    expect(document.querySelector('.ugp-inspector-shell')).toBeNull();
  });
});
