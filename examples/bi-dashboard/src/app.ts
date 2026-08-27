import {
  ContextRegistry,
  SemanticRegistry,
  resolveSelection,
  type Registration,
} from '@ui-grounding/core';
import {
  DomAnchorRegistry,
  type DomAnchorRegistration,
} from '@ui-grounding/dom';
import {
  SelectionOverlay,
  renderAmbiguityChooser,
  type OverlayMode,
} from '@ui-grounding/overlay';
import type {
  Anchor,
  ContextBundle,
  GroundingBundle,
  ResolvedReferent,
  Selection,
  SemanticNode,
} from '@ui-grounding/protocol';

import { BiScenarioBackend } from './backend.js';
import { BiChartAdapter } from './chart-adapter.js';
import type { DashboardResponse, Role } from './model.js';
import { VirtualOrderTable } from './virtual-table.js';

type Descriptor = NonNullable<SemanticNode['contextDescriptors']>[number];

const summaryDescriptor: Descriptor = {
  name: 'summary',
  description: 'Minimal business projection for the selected referent.',
  schema: { type: 'object' },
  sensitivity: 'internal',
  freshness: 'on-demand',
  estimatedBytes: 256,
};
const costDescriptor: Descriptor = {
  name: 'cost',
  description: 'Cost, margin, formula, and anomaly details for analysts.',
  schema: { type: 'object' },
  sensitivity: 'confidential',
  freshness: 'on-demand',
  estimatedBytes: 384,
};

function selectionForRect(
  registry: SemanticRegistry,
  rect: DOMRect | { left: number; top: number; right: number; bottom: number },
  mode: 'point' | 'region' = 'point',
): Selection {
  const geometry =
    mode === 'point'
      ? {
          kind: 'point' as const,
          coordinateSpace: 'viewport' as const,
          x: (rect.left + rect.right) / 2,
          y: (rect.top + rect.bottom) / 2,
        }
      : {
          kind: 'rect' as const,
          coordinateSpace: 'viewport' as const,
          x: rect.left,
          y: rect.top,
          width: rect.right - rect.left,
          height: rect.bottom - rect.top,
        };
  return {
    selectionId: `selection:${mode}:${Date.now().toString(36)}`,
    surfaceId: registry.surfaceId,
    mode,
    selectors: [{ type: 'UGPGeometrySelector', geometry }],
    geometry,
    surfaceRevision: registry.surfaceRevision,
    createdAt: new Date().toISOString(),
    source: 'human',
  };
}

function delay(signal: AbortSignal, milliseconds: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Context request aborted', 'AbortError'));
      return;
    }
    const timeout = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timeout);
        reject(new DOMException('Context request aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

export interface BiLabApi {
  readonly surfaceId: string;
  readonly debugEnabled: boolean;
  readonly overlayEnabled: boolean;
  readonly role: Role;
  readonly grounding: GroundingBundle | undefined;
  readonly context: ContextBundle | undefined;
  selectElement(selector: string, mode?: 'point' | 'region'): GroundingBundle;
  selectCanvasPoint(index: number): GroundingBundle;
  selectCanvasInterval(start: number, end: number): GroundingBundle;
  selectRegions(regionIds: string[]): GroundingBundle;
  selectVisibleRecord(index?: number, regionCell?: boolean): GroundingBundle;
  selectTextFragment(exact: string): GroundingBundle;
  selectSameRegionViews(regionId: string): GroundingBundle;
  selectTwoWidgets(): GroundingBundle;
  mutateFilter(regionId?: string): GroundingBundle | undefined;
  sortAndScroll(index: number): string;
  setRole(role: Role): void;
  requestContext(
    requestedContexts: string[],
    budgetBytes: number,
    signal?: AbortSignal,
  ): Promise<ContextBundle>;
  toggleOverlay(enabled: boolean): void;
  benchmark(iterations?: number): { iterations: number; durationMs: number };
  diagnostics(): {
    logicalRecords: number;
    registeredAnchors: number;
    registeredNodes: number;
    surfaceRevision: string;
  };
  destroy(): void;
}

export function createBiLab(root: HTMLElement): BiLabApi {
  const backend = new BiScenarioBackend();
  let dashboard = backend.dashboard();
  const registry = new SemanticRegistry({
    surfaceId: 'surface:bi-dashboard',
    surfaceRevision: dashboard.state.queryRevision,
  });
  const contextRegistry = new ContextRegistry();
  const domRegistry = new DomAnchorRegistry({ registry });
  const nodeHandles: Registration<SemanticNode>[] = [];
  const domHandles: DomAnchorRegistration[] = [];
  const extraAnchorHandles: Registration<Anchor>[] = [];
  const contextDisposals: Array<() => void> = [];
  const contextNodes = new Set<string>();
  let role: Role = 'analyst';
  let currentGrounding: GroundingBundle | undefined;
  let currentContext: ContextBundle | undefined;
  let overlay: SelectionOverlay | undefined;
  let overlayMode: OverlayMode = 'point';
  let chooserDispose: (() => void) | undefined;
  let fragmentSequence = 0;

  const registerNode = (
    value: SemanticNode,
    element?: Element,
    anchorOptions: { anchorId?: string; priority?: number } = {},
  ): void => {
    nodeHandles.push(registry.registerNode(value));
    if (element) {
      domHandles.push(
        domRegistry.register(element, value.nodeId, {
          ...anchorOptions,
          detectOcclusion: false,
        }),
      );
    }
  };

  registerNode(
    {
      nodeId: 'dashboard:operating-review',
      type: 'org.ugp.demo.bi.dashboard',
      label: 'Operating review dashboard',
      authority: 'authoritative',
      entityRef: { namespace: 'dashboards', id: 'operating-review' },
      anchorIds: [],
    },
    root.querySelector('.shell')!,
    { anchorId: 'dom:dashboard' },
  );

  for (const metric of dashboard.metrics) {
    const card = root.querySelector(`[data-metric-id="${metric.id}"]`)!;
    const metricNodeId = `metric:${metric.id}`;
    registerNode(
      {
        nodeId: metricNodeId,
        type: 'org.ugp.demo.bi.metric',
        label: metric.label,
        authority: 'authoritative',
        entityRef: { namespace: 'metrics', id: metric.id },
        parentNodeId: 'dashboard:operating-review',
        anchorIds: [],
        contextDescriptors: [summaryDescriptor, costDescriptor],
        revision: dashboard.state.queryRevision,
      },
      card,
      { anchorId: `dom:${metricNodeId}` },
    );
    const valueNodeId = `metric-value:${metric.id}`;
    registerNode(
      {
        nodeId: valueNodeId,
        type: 'org.ugp.demo.bi.metric-value',
        label: `${metric.label} value`,
        authority: 'derived',
        entityRef: {
          namespace: 'metric-values',
          id: `${metric.id}@${dashboard.state.queryRevision}`,
        },
        parentNodeId: metricNodeId,
        anchorIds: [],
        revision: dashboard.state.queryRevision,
      },
      card.querySelector('[data-metric-value]')!,
      { anchorId: `dom:${valueNodeId}`, priority: 20 },
    );
  }

  registerNode(
    {
      nodeId: 'filter:region',
      type: 'org.ugp.demo.bi.filter',
      label: 'Region filter',
      authority: 'authoritative',
      entityRef: { namespace: 'filters', id: 'region:all' },
      parentNodeId: 'dashboard:operating-review',
      anchorIds: [],
    },
    root.querySelector('[data-action="filter"]')!,
    { anchorId: 'dom:filter:region' },
  );
  registerNode(
    {
      nodeId: 'widget:records',
      type: 'org.ugp.demo.bi.widget',
      label: 'Order records',
      authority: 'authoritative',
      entityRef: { namespace: 'widgets', id: 'records' },
      parentNodeId: 'dashboard:operating-review',
      anchorIds: [],
    },
    root.querySelector('.records-panel')!,
    { anchorId: 'dom:widget:records' },
  );
  registerNode(
    {
      nodeId: 'insight:revenue-drop',
      type: 'org.ugp.demo.bi.insight',
      label: 'Revenue drop insight',
      authority: 'authoritative',
      entityRef: { namespace: 'insights', id: 'revenue-drop' },
      parentNodeId: 'dashboard:operating-review',
      anchorIds: [],
      contextDescriptors: [summaryDescriptor, costDescriptor],
      revision: dashboard.state.queryRevision,
    },
    root.querySelector('[data-insight-id="revenue-drop"]')!,
    { anchorId: 'dom:insight:revenue-drop' },
  );
  extraAnchorHandles.push(
    registry.registerAnchor({
      anchorId: 'text:insight:revenue-drop',
      nodeId: 'insight:revenue-drop',
      kind: 'text',
      surfaceRevision: registry.surfaceRevision,
      selectors: [
        {
          type: 'TextQuoteSelector',
          exact: dashboard.insight.text,
        },
        {
          type: 'TextPositionSelector',
          start: 0,
          end: dashboard.insight.text.length,
        },
      ],
    }),
  );

  const canvas = root.querySelector<HTMLCanvasElement>('#trend-chart')!;
  const svg = root.querySelector<SVGSVGElement>('.bar-chart')!;
  const chartAdapter = new BiChartAdapter({ registry, canvas, svg, dashboard });
  domHandles.push(
    domRegistry.register(
      root.querySelector('.trend-panel')!,
      'chart:revenue-trend',
      { anchorId: 'dom:chart:revenue-trend', detectOcclusion: false },
    ),
    domRegistry.register(
      root.querySelector('.region-panel')!,
      'chart:region-breakdown',
      { anchorId: 'dom:chart:region-breakdown', detectOcclusion: false },
    ),
  );
  const table = new VirtualOrderTable({
    viewport: root.querySelector('.virtual-viewport')!,
    registry,
    domRegistry,
    records: backend.records(),
  });

  function ensureContexts(referent: ResolvedReferent): void {
    if (contextNodes.has(referent.nodeId)) return;
    contextNodes.add(referent.nodeId);
    contextDisposals.push(
      contextRegistry.register(
        referent.nodeId,
        summaryDescriptor,
        async ({ signal }) => {
          await delay(signal, 4);
          return backend.context(referent, role).projection;
        },
      ),
      contextRegistry.register(
        referent.nodeId,
        costDescriptor,
        async ({ signal }) => {
          await delay(signal, 24);
          return backend.context(referent, role).projection;
        },
      ),
    );
  }

  function renderInspector(elapsedMs: number): void {
    const inspector = root.querySelector<HTMLElement>('.inspector')!;
    const referent = currentGrounding?.referents[0];
    inspector.classList.toggle('empty', !referent);
    const preview = inspector.querySelector('.selection-preview')!;
    preview.innerHTML = `<span class="crosshair">⌖</span><div><small>${currentGrounding?.selection.mode.toUpperCase() ?? 'NO'} SELECTION</small><strong>${currentGrounding?.selection.selectionId ?? 'Choose a target'}</strong></div><b>${elapsedMs.toFixed(2)}ms</b>`;
    const card = inspector.querySelector('.referent-card')!;
    const groundingProblem = currentGrounding?.problem;
    card.innerHTML = referent
      ? `<span class="authority">${referent.authority.toUpperCase()}</span><h3>${referent.label}</h3><code>${referent.type}</code><dl><div><dt>entityRef</dt><dd>${referent.entityRef ? `${referent.entityRef.namespace}/${referent.entityRef.id}` : referent.nodeId}</dd></div><div><dt>relation</dt><dd>${referent.relation}</dd></div><div><dt>confidence</dt><dd>${referent.confidence.toFixed(2)}</dd></div><div><dt>revision</dt><dd>${referent.nodeRevision ?? referent.surfaceRevision}</dd></div></dl>`
      : groundingProblem
        ? `<span class="problem-code">${groundingProblem.code}</span><h3>${groundingProblem.title}</h3><code>${groundingProblem.detail}</code>`
        : '<h3>No referent</h3><code>Select a visible object</code>';
    const evidence = inspector.querySelector('.evidence')!;
    evidence.innerHTML = `<h3>Evidence <span>${referent?.evidence.length ?? 0}</span></h3>${(referent?.evidence ?? []).map((item, index) => `<div><i>${String(index + 1).padStart(2, '0')}</i><p><strong>${item.kind}</strong><small>${item.authority} · score ${item.score?.toFixed(2) ?? 'n/a'}</small></p></div>`).join('')}`;
    const bundleJson = inspector.querySelector<HTMLElement>('.bundle-json')!;
    bundleJson.textContent = JSON.stringify(
      { grounding: currentGrounding, context: currentContext },
      null,
      2,
    );
    const contextButton = inspector.querySelector<HTMLButtonElement>(
      '[data-action="context"]',
    )!;
    contextButton.disabled = !referent;
    const contextSummary =
      inspector.querySelector<HTMLElement>('.context-summary')!;
    contextSummary.hidden = !currentContext;
    if (currentContext) {
      const emitted = currentContext.referentContexts.flatMap((item) =>
        Object.keys(item.contexts),
      );
      emitted.sort();
      const omitted = currentContext.referentContexts.flatMap(
        (item) => item.omitted ?? [],
      );
      contextSummary.textContent = `${role} · approved: ${emitted.join(', ') || 'none'} · omitted: ${omitted.map((item) => `${item.name} (${item.reason})`).join(', ') || 'none'}`;
    }
    chooserDispose?.();
    if (currentGrounding) {
      chooserDispose = renderAmbiguityChooser(
        inspector,
        currentGrounding,
        (chosen) => {
          currentGrounding = {
            ...currentGrounding!,
            referents: [chosen],
            ambiguity: { requiresDisambiguation: false },
          };
          renderInspector(elapsedMs);
        },
      );
    }
  }

  function resolve(selection: Selection): GroundingBundle {
    const started = performance.now();
    currentContext = undefined;
    currentGrounding = resolveSelection(registry.getSnapshot(), selection);
    renderInspector(performance.now() - started);
    return currentGrounding;
  }

  function prepareTextFragment(selection: Selection): Selection {
    const quote = selection.selectors.find(
      (selector) => selector.type === 'TextQuoteSelector',
    );
    if (!quote || !dashboard.insight.text.includes(quote.exact))
      return selection;
    fragmentSequence += 1;
    const nodeId = `text-fragment:revenue-drop:${fragmentSequence}`;
    nodeHandles.push(
      registry.registerNode({
        nodeId,
        type: 'ugp.ui.text-fragment',
        label: quote.exact,
        authority: 'derived',
        entityRef: {
          namespace: 'text-fragments',
          id: `revenue-drop:${fragmentSequence}`,
        },
        parentNodeId: 'insight:revenue-drop',
        anchorIds: [],
        revision: dashboard.state.queryRevision,
      }),
    );
    extraAnchorHandles.push(
      registry.registerAnchor({
        anchorId: `text:${nodeId}`,
        nodeId,
        kind: 'text',
        surfaceRevision: registry.surfaceRevision,
        priority: 30,
        selectors: [{ type: 'TextQuoteSelector', exact: quote.exact }],
      }),
    );
    return {
      ...selection,
      selectors: [
        { type: 'UGPSemanticSelector', nodeId },
        ...selection.selectors,
      ],
    };
  }

  const routeChartInterval = (selection: Selection): Selection => {
    const geometry = selection.geometry;
    if (
      selection.mode !== 'region' ||
      geometry?.kind !== 'rect' ||
      geometry.coordinateSpace !== 'viewport'
    ) {
      return selection;
    }
    const rect = canvas.getBoundingClientRect();
    const right = geometry.x + geometry.width;
    const bottom = geometry.y + geometry.height;
    if (
      right < rect.left ||
      geometry.x > rect.right ||
      bottom < rect.top ||
      geometry.y > rect.bottom
    ) {
      return selection;
    }
    const plotLeft = rect.left + 28;
    const plotWidth = Math.max(1, rect.width - 48);
    const lastIndex = dashboard.revenueSeries.length - 1;
    const indexAt = (x: number) =>
      Math.max(
        0,
        Math.min(
          lastIndex,
          Math.round(((x - plotLeft) / plotWidth) * lastIndex),
        ),
      );
    return chartAdapter.intervalSelection(
      indexAt(Math.max(geometry.x, plotLeft)),
      indexAt(Math.min(right, plotLeft + plotWidth)),
    );
  };

  const handleOverlaySelection = (selection: Selection): void => {
    const routed = routeChartInterval(selection);
    resolve(routed.mode === 'text' ? prepareTextFragment(routed) : routed);
  };
  const createOverlay = (): SelectionOverlay =>
    new SelectionOverlay({
      surfaceId: registry.surfaceId,
      surfaceRevision: () => registry.surfaceRevision,
      root: root.querySelector('.shell')!,
      mode: 'point',
      onSelection: handleOverlaySelection,
    });
  overlay = createOverlay();

  const tooltip = root.querySelector<HTMLElement>('.chart-tooltip')!;
  const hideTooltip = (): void => {
    tooltip.hidden = true;
  };
  const showTooltip = (event: PointerEvent, text: string): void => {
    if (overlay && overlayMode !== 'point') {
      hideTooltip();
      return;
    }
    tooltip.textContent = text;
    tooltip.style.left = `${Math.min(window.innerWidth - 190, event.clientX + 12)}px`;
    tooltip.style.top = `${Math.min(window.innerHeight - 54, event.clientY + 12)}px`;
    tooltip.hidden = false;
  };
  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    const plotWidth = Math.max(1, rect.width - 46);
    const index = Math.max(
      0,
      Math.min(
        dashboard.revenueSeries.length - 1,
        Math.round(
          ((event.clientX - rect.left - 28) / plotWidth) *
            (dashboard.revenueSeries.length - 1),
        ),
      ),
    );
    const point = dashboard.revenueSeries[index];
    if (point) {
      showTooltip(
        event,
        `${point.period} · Revenue $${Math.round(point.value).toLocaleString()}`,
      );
    }
  });
  canvas.addEventListener('pointerleave', hideTooltip);
  svg.addEventListener('pointermove', (event) => {
    const bar = (event.target as Element).closest<SVGRectElement>(
      '[data-region-id]',
    );
    if (!bar) {
      hideTooltip();
      return;
    }
    const member = dashboard.regionBreakdown.find(
      (item) => item.id === bar.dataset.regionId,
    );
    if (member) {
      showTooltip(
        event,
        `${member.label} · Revenue $${Math.round(member.value).toLocaleString()}`,
      );
    }
  });
  svg.addEventListener('pointerleave', hideTooltip);

  function updateDashboard(next: DashboardResponse): void {
    dashboard = next;
    registry.setSurfaceRevision(next.state.queryRevision);
    root.querySelector('.revision strong')!.textContent =
      next.state.queryRevision;
    root.querySelector('.record-count')!.textContent =
      `${next.totalRecords.toLocaleString()} logical rows · sort`;
    table.update(backend.records());
    domRegistry.refresh();
    chartAdapter.update(next);
    drawTrend(canvas, next);
  }

  root.querySelector('.selection-mode')!.addEventListener('click', (event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>(
      '[data-mode]',
    );
    if (!button) return;
    root
      .querySelectorAll('.selection-mode button')
      .forEach((item) => item.classList.toggle('active', item === button));
    overlayMode = button.dataset.mode as OverlayMode;
    overlay?.setMode(overlayMode);
    hideTooltip();
  });
  root.querySelector('[data-action="role"]')!.addEventListener('click', () => {
    role = role === 'analyst' ? 'viewer' : 'analyst';
    currentContext = undefined;
    root.querySelector('[data-action="role"]')!.firstChild!.textContent =
      role === 'analyst' ? 'Analyst ' : 'Viewer ';
    renderInspector(0);
  });
  root
    .querySelector('[data-action="filter"]')!
    .addEventListener('click', () => {
      const previousSelection = currentGrounding?.selection;
      const regionId = backend.state.regionId ? undefined : 'east';
      updateDashboard(backend.mutate({ regionId: regionId ?? null }));
      root.querySelector('[data-action="filter"]')!.childNodes[0]!.textContent =
        regionId ? 'East region ' : 'All regions ';
      if (previousSelection) {
        resolve(previousSelection as unknown as Selection);
      }
    });
  root.querySelector('[data-action="sort"]')!.addEventListener('click', () => {
    const sort =
      backend.state.sort === 'revenue-desc' ? 'revenue-asc' : 'revenue-desc';
    updateDashboard(backend.mutate({ sort }));
  });
  root.querySelector('.inspector')!.addEventListener('click', (event) => {
    const action = (event.target as Element).closest<HTMLButtonElement>(
      '[data-action]',
    );
    if (action?.dataset.action === 'bundle') {
      const bundle = root.querySelector<HTMLElement>('.bundle-json')!;
      bundle.hidden = !bundle.hidden;
    }
    if (action?.dataset.action === 'context') {
      action.disabled = true;
      action.firstChild!.textContent = 'Requesting context ';
      void api
        .requestContext(['summary', 'cost'], 4096)
        .catch((error: unknown) => {
          const summary = root.querySelector<HTMLElement>('.context-summary')!;
          summary.hidden = false;
          summary.textContent =
            error instanceof Error ? error.message : 'Context request failed';
        })
        .finally(() => {
          action.firstChild!.textContent = 'Request approved context ';
          action.disabled = !currentGrounding?.referents[0];
        });
    }
  });
  root
    .querySelector('.inspector-head button')!
    .addEventListener('click', () => {
      api.toggleOverlay(false);
    });

  const api: BiLabApi = {
    surfaceId: registry.surfaceId,
    debugEnabled: import.meta.env.VITE_UGP_DEBUG === 'true',
    get overlayEnabled() {
      return Boolean(overlay);
    },
    get role() {
      return role;
    },
    get grounding() {
      return currentGrounding;
    },
    get context() {
      return currentContext;
    },
    selectElement(selector, mode = 'point') {
      const element = root.querySelector(selector);
      if (!element) throw new Error(`Missing element: ${selector}`);
      return resolve(
        selectionForRect(registry, element.getBoundingClientRect(), mode),
      );
    },
    selectCanvasPoint(index) {
      return resolve(chartAdapter.pointSelection(index));
    },
    selectCanvasInterval(start, end) {
      return resolve(chartAdapter.intervalSelection(start, end));
    },
    selectRegions(regionIds) {
      return resolve(chartAdapter.regionSelection(regionIds));
    },
    selectVisibleRecord(index = 0, regionCell = false) {
      // Recycled virtual rows can move between observer notifications. Refresh
      // their anchors synchronously so this action resolves against the layout
      // the user can currently see.
      domRegistry.refresh();
      const row = table.visibleRow(index);
      if (!row) throw new Error('No visible record row');
      const target = regionCell ? row.querySelector('.region-cell')! : row;
      return resolve(
        selectionForRect(registry, target.getBoundingClientRect()),
      );
    },
    selectTextFragment(exact) {
      const selection: Selection = {
        selectionId: `selection:text:${Date.now().toString(36)}`,
        surfaceId: registry.surfaceId,
        mode: 'text',
        selectors: [{ type: 'TextQuoteSelector', exact }],
        surfaceRevision: registry.surfaceRevision,
        createdAt: new Date().toISOString(),
        source: 'human',
      };
      return resolve(prepareTextFragment(selection));
    },
    selectSameRegionViews(regionId) {
      const recordIndex = backend
        .records()
        .findIndex((record) => record.regionId === regionId);
      table.scrollToIndex(recordIndex);
      const record = table.visibleRecord(0)!;
      return resolve({
        selectionId: `selection:same-region:${regionId}`,
        surfaceId: registry.surfaceId,
        mode: 'semantic',
        selectors: [
          {
            type: 'UGPSemanticSelector',
            nodeId: `region:${regionId}:chart`,
          },
          {
            type: 'UGPSemanticSelector',
            nodeId: `region:${regionId}:record:${record.id}`,
          },
        ],
        surfaceRevision: registry.surfaceRevision,
        createdAt: new Date().toISOString(),
        source: 'application',
      });
    },
    selectTwoWidgets() {
      return resolve({
        selectionId: 'selection:two-widgets',
        surfaceId: registry.surfaceId,
        mode: 'programmatic',
        selectors: [
          { type: 'UGPSemanticSelector', nodeId: 'chart:revenue-trend' },
          { type: 'UGPSemanticSelector', nodeId: 'widget:records' },
        ],
        surfaceRevision: registry.surfaceRevision,
        createdAt: new Date().toISOString(),
        source: 'application',
      });
    },
    mutateFilter(regionId) {
      const previous = currentGrounding;
      updateDashboard(backend.mutate({ regionId: regionId ?? null }));
      return previous
        ? resolveSelection(
            registry.getSnapshot(),
            previous.selection as unknown as Selection,
          )
        : undefined;
    },
    sortAndScroll(index) {
      updateDashboard(
        backend.mutate({
          sort:
            backend.state.sort === 'revenue-desc'
              ? 'revenue-asc'
              : 'revenue-desc',
        }),
      );
      table.scrollToIndex(index);
      return table.visibleRecord()?.id ?? '';
    },
    setRole(nextRole) {
      role = nextRole;
      root.querySelector('[data-action="role"]')!.firstChild!.textContent =
        role === 'analyst' ? 'Analyst ' : 'Viewer ';
    },
    async requestContext(requestedContexts, budgetBytes, signal) {
      if (!currentGrounding) throw new Error('Select a referent first');
      for (const referent of currentGrounding.referents)
        ensureContexts(referent);
      const controller = signal ? undefined : new AbortController();
      currentContext = await contextRegistry.materialize({
        grounding: currentGrounding,
        principalRef: `role:${role}`,
        purpose: 'explain',
        requestedContexts,
        budgetBytes,
        signal: signal ?? controller!.signal,
        authorize: ({ descriptor }) =>
          role === 'analyst' || descriptor.sensitivity !== 'confidential',
      });
      renderInspector(0);
      return currentContext;
    },
    toggleOverlay(enabled) {
      if (enabled && !overlay) overlay = createOverlay();
      if (!enabled && overlay) {
        overlay.dispose();
        overlay = undefined;
      }
      document.body.classList.toggle('overlay-disabled', !enabled);
      root.querySelector('.inspector')!.toggleAttribute('hidden', !enabled);
      hideTooltip();
    },
    benchmark(iterations = 200) {
      const selection = chartAdapter.regionSelection(['east', 'west']);
      const snapshot = registry.getSnapshot();
      const started = performance.now();
      for (let index = 0; index < iterations; index += 1) {
        resolveSelection(snapshot, selection);
      }
      return { iterations, durationMs: performance.now() - started };
    },
    diagnostics() {
      const snapshot = registry.getSnapshot();
      return {
        logicalRecords: backend.data.records.length,
        registeredAnchors: snapshot.anchors.length,
        registeredNodes: snapshot.nodes.length,
        surfaceRevision: snapshot.surfaceRevision,
      };
    },
    destroy() {
      chooserDispose?.();
      overlay?.dispose();
      table.dispose();
      chartAdapter.dispose();
      for (const dispose of contextDisposals) dispose();
      for (const anchor of extraAnchorHandles) anchor.dispose();
      for (const anchor of domHandles) anchor.dispose();
      for (const node of [...nodeHandles].reverse()) node.dispose();
      domRegistry.dispose();
      contextRegistry.dispose();
      registry.dispose();
    },
  };

  Object.defineProperty(window, 'ugpBiLab', {
    configurable: true,
    value: api,
  });
  drawTrend(canvas, dashboard);
  return api;
}

function drawTrend(
  canvas: HTMLCanvasElement,
  dashboard: DashboardResponse,
): void {
  const rect = canvas.getBoundingClientRect();
  const ratio = devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(rect.width * ratio));
  canvas.height = Math.max(1, Math.round(rect.height * ratio));
  const context = canvas.getContext('2d')!;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, rect.width, rect.height);
  context.strokeStyle = '#e2e8f0';
  context.lineWidth = 1;
  for (let y = 24; y < rect.height - 20; y += 42) {
    context.beginPath();
    context.moveTo(28, y);
    context.lineTo(rect.width - 18, y);
    context.stroke();
  }
  const values = dashboard.revenueSeries.map((point) => point.value);
  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  context.beginPath();
  for (const [index, value] of values.entries()) {
    const x = 28 + (index / (values.length - 1)) * (rect.width - 46);
    const y =
      rect.height -
      24 -
      ((value - minimum) / Math.max(1, maximum - minimum)) * (rect.height - 52);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.strokeStyle = '#2563eb';
  context.lineWidth = 2;
  context.stroke();
}

declare global {
  interface Window {
    ugpBiLab?: BiLabApi;
  }
}
