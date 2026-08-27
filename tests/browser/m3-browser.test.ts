import { ContextRegistry, SemanticRegistry } from '@ui-grounding/core';
import {
  DomAnchorRegistry,
  domPath,
  measureDomElement,
} from '@ui-grounding/dom';
import {
  renderAmbiguityChooser,
  SelectionOverlay,
} from '@ui-grounding/overlay';
import type { GroundingBundle, Selection } from '@ui-grounding/protocol';
import {
  GroundingSurfaceProvider,
  useGroundingNode,
  useGroundingRuntime,
  useGroundingSnapshot,
} from '@ui-grounding/react';
import { createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

function semanticNode(nodeId: string) {
  return {
    nodeId,
    type: 'org.example.analytics.metric',
    label: nodeId,
    authority: 'authoritative' as const,
    anchorIds: [],
  };
}

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

describe('M3 browser components', () => {
  it('measures clipping, occlusion, scroll changes, portals, and open Shadow DOM', async () => {
    document.body.style.margin = '0';
    const clip = document.createElement('div');
    Object.assign(clip.style, {
      position: 'absolute',
      left: '10px',
      top: '10px',
      width: '100px',
      height: '80px',
      overflow: 'hidden',
    });
    const target = document.createElement('div');
    Object.assign(target.style, {
      width: '200px',
      height: '60px',
    });
    clip.append(target);
    document.body.append(clip);
    const measurement = measureDomElement(target, { detectOcclusion: false });
    expect(measurement.visibility).toBe('visible');
    expect(measurement.geometry?.kind).toBe('rect');
    if (measurement.geometry?.kind === 'rect') {
      expect(measurement.geometry.width).toBeCloseTo(100, 0);
    }

    const cover = document.createElement('div');
    Object.assign(cover.style, {
      position: 'absolute',
      left: '10px',
      top: '10px',
      width: '100px',
      height: '80px',
      zIndex: '10',
    });
    document.body.append(cover);
    expect(measureDomElement(target).visibility).toBe('occluded');
    cover.remove();

    const registry = new SemanticRegistry({
      surfaceId: 'surface:browser',
      surfaceRevision: '1',
    });
    registry.registerNode(semanticNode('target'));
    const dom = new DomAnchorRegistry({ registry });
    dom.register(target, 'target', {
      anchorId: 'dom:target',
      detectOcclusion: false,
    });
    expect(registry.getAnchor('dom:target')?.kind).toBe('dom');
    registry.registerNode(semanticNode('target-secondary'));
    const secondary = dom.register(target, 'target-secondary', {
      anchorId: 'dom:target-secondary',
      detectOcclusion: false,
    });
    expect(target.getAttribute('data-ugp-anchor')?.split(' ')).toEqual([
      'dom:target',
      'dom:target-secondary',
    ]);
    secondary.dispose();
    expect(target.getAttribute('data-ugp-anchor')).toBe('dom:target');
    clip.style.left = '40px';
    document.dispatchEvent(new Event('scroll'));
    await until(() => {
      const anchor = registry.getAnchor('dom:target');
      expect(anchor?.geometry?.kind).toBe('rect');
      if (anchor?.geometry?.kind === 'rect')
        expect(anchor.geometry.x).toBeCloseTo(40, 0);
    });

    const host = document.createElement('div');
    Object.assign(host.style, {
      position: 'absolute',
      left: '200px',
      top: '20px',
    });
    const shadow = host.attachShadow({ mode: 'open' });
    const shadowTarget = document.createElement('span');
    shadowTarget.textContent = 'Shadow metric';
    Object.assign(shadowTarget.style, {
      display: 'inline-block',
      width: '80px',
    });
    shadow.append(shadowTarget);
    document.body.append(host);
    registry.registerNode(semanticNode('shadow'));
    dom.register(shadowTarget, 'shadow', {
      anchorId: 'dom:shadow',
      detectOcclusion: false,
    });
    expect(domPath(shadowTarget.firstChild!)).toContain('::shadow');
    expect(registry.getAnchor('dom:shadow')?.visibility).toBe('visible');

    const portal = document.createElement('button');
    portal.textContent = 'Portal metric';
    document.body.append(portal);
    registry.registerNode(semanticNode('portal'));
    dom.register(portal, 'portal', {
      anchorId: 'dom:portal',
      detectOcclusion: false,
    });
    expect(registry.getAnchor('dom:portal')?.nodeId).toBe('portal');
    dom.dispose();
    registry.dispose();
  });

  it('captures point, region, text, and Escape cancellation', () => {
    const selections: Selection[] = [];
    let cancellations = 0;
    const overlay = new SelectionOverlay({
      surfaceId: 'surface:browser',
      surfaceRevision: () => '7',
      onSelection: (selection) => selections.push(selection),
      onCancel: () => {
        cancellations += 1;
      },
    });
    document.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        clientX: 20,
        clientY: 30,
        pointerId: 1,
      }),
    );
    document.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        button: 0,
        clientX: 20,
        clientY: 30,
        pointerId: 1,
      }),
    );
    expect(selections[0]?.mode).toBe('point');
    expect(selections[0]?.surfaceRevision).toBe('7');

    overlay.setMode('region');
    document.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        clientX: 80,
        clientY: 90,
        pointerId: 2,
      }),
    );
    document.dispatchEvent(
      new PointerEvent('pointermove', {
        bubbles: true,
        clientX: 20,
        clientY: 30,
        pointerId: 2,
      }),
    );
    document.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        button: 0,
        clientX: 20,
        clientY: 30,
        pointerId: 2,
      }),
    );
    expect(selections[1]?.geometry).toMatchObject({
      kind: 'rect',
      x: 20,
      y: 30,
      width: 60,
      height: 60,
    });

    const paragraph = document.createElement('p');
    paragraph.textContent = 'Revenue increased this quarter.';
    document.body.append(paragraph);
    const range = document.createRange();
    range.setStart(paragraph.firstChild!, 0);
    range.setEnd(paragraph.firstChild!, 7);
    const native = document.getSelection()!;
    native.removeAllRanges();
    native.addRange(range);
    overlay.setMode('text');
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    expect(selections[2]?.mode).toBe('text');
    expect(selections[2]?.selectors[0]).toMatchObject({
      type: 'TextQuoteSelector',
      exact: 'Revenue',
    });

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(cancellations).toBeGreaterThan(0);
    overlay.dispose();
  });

  it('renders a keyboard-focusable ambiguity chooser', () => {
    const chosen: string[] = [];
    const grounding = {
      ambiguity: {
        requiresDisambiguation: true,
        candidates: [
          {
            nodeId: 'a',
            type: 'org.example.metric',
            label: 'Revenue',
            authority: 'authoritative',
            confidence: 1,
            relation: 'exact',
            evidence: [
              {
                kind: 'semantic-selector',
                authority: 'authoritative',
                score: 1,
              },
            ],
            surfaceRevision: '1',
          },
        ],
      },
    } as unknown as GroundingBundle;
    const dispose = renderAmbiguityChooser(
      document.body,
      grounding,
      (referent) => chosen.push(referent.nodeId),
    );
    const button = document.querySelector<HTMLButtonElement>(
      '.ugp-ambiguity button',
    )!;
    expect(document.activeElement).toBe(button);
    button.click();
    expect(chosen).toEqual(['a']);
    dispose();
  });

  it('keeps React Strict Mode registration singular and updates snapshots', async () => {
    const mount = document.createElement('div');
    document.body.append(mount);

    function Probe() {
      const binding = useGroundingNode(semanticNode('react-metric'), {
        anchor: { anchorId: 'dom:react', detectOcclusion: false },
      });
      const snapshot = useGroundingSnapshot();
      return createElement(
        'div',
        {
          ref: binding.ref,
          style: { width: 100, height: 40 },
          'data-nodes': snapshot.nodes.length,
          'data-anchors': snapshot.anchors.length,
        },
        'React metric',
      );
    }

    const root = createRoot(mount);
    root.render(
      createElement(
        StrictMode,
        null,
        createElement(
          GroundingSurfaceProvider,
          { surfaceId: 'surface:react', surfaceRevision: '1' },
          createElement(Probe),
        ),
      ),
    );
    await until(() => {
      const probe = mount.firstElementChild;
      expect(probe?.getAttribute('data-nodes')).toBe('1');
      expect(probe?.getAttribute('data-anchors')).toBe('1');
      expect(probe?.getAttribute('data-ugp-anchor')).toBe('dom:react');
    });
    root.unmount();
  });

  it('exposes authorization-first ContextRegistry in a browser runtime', async () => {
    const registry = new ContextRegistry();
    let materialized = false;
    registry.register(
      'metric',
      {
        name: 'secret',
        description: 'A secret.',
        schema: {},
        sensitivity: 'restricted',
        freshness: 'on-demand',
      },
      () => {
        materialized = true;
        return 'hidden';
      },
    );
    const bundle = await registry.materialize({
      grounding: {
        groundingId: 'grounding:browser',
        selection: {
          selectionId: 'selection:browser',
          surfaceId: 'surface:browser',
          mode: 'semantic',
          selectors: [{ type: 'UGPSemanticSelector', nodeId: 'metric' }],
          surfaceRevision: '1',
          createdAt: new Date().toISOString(),
          source: 'human',
        },
        referents: [
          {
            nodeId: 'metric',
            type: 'org.example.metric',
            label: 'Metric',
            authority: 'authoritative',
            confidence: 1,
            relation: 'exact',
            evidence: [
              {
                kind: 'semantic-selector',
                authority: 'authoritative',
                score: 1,
              },
            ],
            surfaceRevision: '1',
          },
        ],
        generatedAt: new Date().toISOString(),
      },
      purpose: 'inspect',
      budgetBytes: 100,
      signal: new AbortController().signal,
      authorize: () => false,
    });
    expect(materialized).toBe(false);
    expect(bundle.authorization.filtered).toBe(true);
  });

  it('fails closed for hidden DOM and cleans every registration path', () => {
    const detached = document.createElement('div');
    expect(measureDomElement(detached).visibility).toBe('offscreen');

    const hidden = document.createElement('div');
    hidden.style.width = '20px';
    hidden.style.height = '20px';
    hidden.style.display = 'none';
    document.body.append(hidden);
    expect(measureDomElement(hidden).visibility).toBe('offscreen');
    hidden.style.display = 'block';
    hidden.style.visibility = 'hidden';
    expect(measureDomElement(hidden).visibility).toBe('offscreen');
    hidden.style.visibility = 'visible';
    hidden.style.opacity = '0';
    expect(measureDomElement(hidden).visibility).toBe('offscreen');

    const empty = document.createElement('span');
    document.body.append(empty);
    expect(measureDomElement(empty).visibility).toBe('offscreen');

    const offscreen = document.createElement('div');
    Object.assign(offscreen.style, {
      position: 'absolute',
      left: '-100px',
      top: '-100px',
      width: '20px',
      height: '20px',
    });
    document.body.append(offscreen);
    expect(measureDomElement(offscreen).visibility).toBe('offscreen');

    const visible = document.createElement('div');
    Object.assign(visible.style, { width: '20px', height: '20px' });
    document.body.append(visible);
    const elementsFromPoint = vi
      .spyOn(document, 'elementsFromPoint')
      .mockReturnValue([]);
    expect(measureDomElement(visible).visibility).toBe('visible');
    elementsFromPoint.mockRestore();

    const registry = new SemanticRegistry({
      surfaceId: 'surface:cleanup',
      surfaceRevision: '1',
    });
    registry.registerNode(semanticNode('cleanup'));
    const dom = new DomAnchorRegistry({
      registry,
      surfaceRevision: () => 'custom-revision',
    });
    const aborted = new AbortController();
    aborted.abort();
    expect(() =>
      dom.register(visible, 'cleanup', { signal: aborted.signal }),
    ).toThrowError(DOMException);

    const controller = new AbortController();
    const registration = dom.register(visible, 'cleanup', {
      priority: 8,
      signal: controller.signal,
    });
    expect(registration.anchorId).toContain('dom:cleanup');
    expect(registry.getAnchor(registration.anchorId)).toMatchObject({
      priority: 8,
      surfaceRevision: 'custom-revision',
    });
    registration.refresh();
    controller.abort();
    expect(visible.hasAttribute('data-ugp-anchor')).toBe(false);
    registration.dispose();
    dom.dispose();
    dom.dispose();
    expect(() => dom.register(visible, 'cleanup')).toThrow('disposed');
  });

  it('ignores invalid overlay gestures and empty ambiguity input', () => {
    const selections: Selection[] = [];
    const overlay = new SelectionOverlay({
      surfaceId: 'surface:overlay-branches',
      surfaceRevision: () => '1',
      minRegionSize: 10,
      onSelection: (selection) => selections.push(selection),
    });
    const overlayUi = document.createElement('button');
    overlayUi.dataset.ugpOverlayUi = 'true';
    document.body.append(overlayUi);
    overlayUi.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }),
    );
    document.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        button: 2,
        pointerId: 2,
      }),
    );
    overlay.setMode('region');
    document.dispatchEvent(
      new PointerEvent('pointermove', { bubbles: true, pointerId: 99 }),
    );
    document.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        clientX: 10,
        clientY: 10,
        pointerId: 3,
      }),
    );
    document.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        clientX: 14,
        clientY: 14,
        pointerId: 3,
      }),
    );
    expect(selections).toEqual([]);

    document.getSelection()?.removeAllRanges();
    overlay.setMode('text');
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    expect(selections).toEqual([]);
    overlay.dispose();
    overlay.dispose();

    const dispose = renderAmbiguityChooser(
      document.body,
      {
        ambiguity: { requiresDisambiguation: false },
      } as unknown as GroundingBundle,
      () => undefined,
    );
    expect(document.querySelector('.ugp-ambiguity')).toBeNull();
    dispose();
  });

  it('updates React nodes and late-bound Context providers', async () => {
    const mount = document.createElement('div');
    document.body.append(mount);
    let runtime: ReturnType<typeof useGroundingRuntime> | undefined;

    function Probe(props: { label: string; value: string }) {
      runtime = useGroundingRuntime();
      const binding = useGroundingNode(
        { ...semanticNode('react-context'), label: props.label },
        {
          contexts: [
            {
              descriptor: {
                name: 'summary',
                description: 'Summary',
                schema: { type: 'string' },
                sensitivity: 'internal',
                freshness: 'on-demand',
              },
              materialize: () => props.value,
              options: { nodeRevision: '1' },
            },
          ],
        },
      );
      return createElement('div', { ref: binding.ref }, props.label);
    }

    const root = createRoot(mount);
    const render = (label: string, value: string) =>
      root.render(
        createElement(
          GroundingSurfaceProvider,
          { surfaceId: 'surface:react-context', surfaceRevision: '1' },
          createElement(Probe, { label, value }),
        ),
      );
    render('First label', 'first');
    await until(() => {
      expect(runtime?.registry.getNode('react-context')?.label).toBe(
        'First label',
      );
      expect(runtime?.registry.getSnapshot().anchors).toHaveLength(1);
    });
    render('Updated label', 'updated');
    await until(() => {
      expect(runtime?.registry.getNode('react-context')?.label).toBe(
        'Updated label',
      );
    });
    const context = await runtime!.contextRegistry.materialize({
      grounding: {
        groundingId: 'grounding:react-context',
        selection: {
          selectionId: 'selection:react-context',
          surfaceId: 'surface:react-context',
          mode: 'semantic',
          selectors: [{ type: 'UGPSemanticSelector', nodeId: 'react-context' }],
          surfaceRevision: '1',
          createdAt: new Date().toISOString(),
          source: 'application',
        },
        referents: [
          {
            nodeId: 'react-context',
            type: 'org.example.analytics.metric',
            label: 'Updated label',
            authority: 'authoritative',
            confidence: 1,
            relation: 'exact',
            evidence: [
              {
                kind: 'semantic-selector',
                authority: 'authoritative',
              },
            ],
            surfaceRevision: '1',
            nodeRevision: '1',
          },
        ],
        ambiguity: { requiresDisambiguation: false },
        generatedAt: new Date().toISOString(),
      },
      purpose: 'inspect',
      requestedContexts: ['summary'],
      budgetBytes: 100,
      signal: new AbortController().signal,
      authorize: () => true,
    });
    expect(context.referentContexts[0]?.contexts.summary).toBe('updated');
    root.unmount();
  });
});
