import type { Registration, SemanticRegistry } from '@ui-grounding/core';
import type { Anchor, Selection, SemanticNode } from '@ui-grounding/protocol';

import type { DashboardResponse, DimensionMember } from './model.js';

function node(
  nodeId: string,
  type: string,
  label: string,
  entityRef: { namespace: string; id: string },
  parentNodeId?: string,
): SemanticNode {
  return {
    nodeId,
    type,
    label,
    authority: 'authoritative',
    entityRef,
    ...(parentNodeId ? { parentNodeId } : {}),
    anchorIds: [],
    revision: '1',
  };
}

export class BiChartAdapter {
  readonly #registry: SemanticRegistry;
  readonly #canvas: HTMLCanvasElement;
  readonly #svg: SVGSVGElement;
  #dashboard: DashboardResponse;
  #nodes: Registration<SemanticNode>[] = [];
  #anchors: Registration<Anchor>[] = [];
  #interval?: Registration<SemanticNode>;
  #resizeObserver: ResizeObserver;

  constructor(options: {
    registry: SemanticRegistry;
    canvas: HTMLCanvasElement;
    svg: SVGSVGElement;
    dashboard: DashboardResponse;
  }) {
    this.#registry = options.registry;
    this.#canvas = options.canvas;
    this.#svg = options.svg;
    this.#dashboard = options.dashboard;
    this.#registerNodes();
    this.#registerAnchors();
    this.#resizeObserver = new ResizeObserver(() => this.refresh());
    this.#resizeObserver.observe(this.#canvas);
    this.#resizeObserver.observe(this.#svg);
  }

  update(dashboard: DashboardResponse): void {
    this.#dashboard = dashboard;
    this.#clearAnchors();
    this.#registerAnchors();
  }

  refresh(): void {
    this.#clearAnchors();
    this.#registerAnchors();
  }

  pointSelection(index: number): Selection {
    const geometry = this.#pointGeometry(index);
    return {
      selectionId: `selection:canvas-point:${index}`,
      surfaceId: this.#registry.surfaceId,
      mode: 'point',
      selectors: [{ type: 'UGPGeometrySelector', geometry }],
      geometry,
      surfaceRevision: this.#registry.surfaceRevision,
      createdAt: new Date().toISOString(),
      source: 'human',
    };
  }

  intervalSelection(startIndex: number, endIndex: number): Selection {
    const start = Math.min(startIndex, endIndex);
    const end = Math.max(startIndex, endIndex);
    const startPeriod = this.#dashboard.revenueSeries[start]?.period;
    const endPeriod = this.#dashboard.revenueSeries[end]?.period;
    if (!startPeriod || !endPeriod) throw new RangeError('Invalid interval');
    this.#interval?.dispose();
    const nodeId = `interval:revenue:${startPeriod}..${endPeriod}`;
    this.#interval = this.#registry.registerNode(
      node(
        nodeId,
        'org.ugp.demo.bi.interval',
        `Revenue from ${startPeriod} to ${endPeriod}`,
        { namespace: 'interval', id: `revenue:${startPeriod}..${endPeriod}` },
        'chart:revenue-trend',
      ),
    );
    const first = this.#pointGeometry(start);
    const last = this.#pointGeometry(end);
    const geometry = {
      kind: 'rect' as const,
      coordinateSpace: 'surface' as const,
      x: first.x,
      y: Math.min(first.y, last.y) - 20,
      width: last.x - first.x,
      height: Math.abs(last.y - first.y) + 40,
    };
    return {
      selectionId: `selection:${nodeId}`,
      surfaceId: this.#registry.surfaceId,
      mode: 'region',
      selectors: [
        { type: 'UGPSemanticSelector', nodeId },
        { type: 'UGPGeometrySelector', geometry },
      ],
      geometry,
      surfaceRevision: this.#registry.surfaceRevision,
      createdAt: new Date().toISOString(),
      source: 'human',
    };
  }

  regionSelection(regionIds: string[]): Selection {
    const bars = regionIds
      .map((id) =>
        this.#svg.querySelector<SVGGraphicsElement>(`[data-region-id="${id}"]`),
      )
      .filter((element): element is SVGGraphicsElement => Boolean(element));
    if (bars.length === 0) throw new Error('No regions selected');
    const rects = bars.map((bar) => bar.getBoundingClientRect());
    const left = Math.min(...rects.map((rect) => rect.left));
    const top = Math.min(...rects.map((rect) => rect.top));
    const right = Math.max(...rects.map((rect) => rect.right));
    const bottom = Math.max(...rects.map((rect) => rect.bottom));
    const geometry = {
      kind: 'rect' as const,
      coordinateSpace: 'viewport' as const,
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    };
    return {
      selectionId: `selection:regions:${regionIds.join('+')}`,
      surfaceId: this.#registry.surfaceId,
      mode: 'region',
      selectors: [{ type: 'UGPGeometrySelector', geometry }],
      geometry,
      surfaceRevision: this.#registry.surfaceRevision,
      createdAt: new Date().toISOString(),
      source: 'human',
    };
  }

  dispose(): void {
    this.#resizeObserver.disconnect();
    this.#clearAnchors();
    for (const registration of this.#nodes) registration.dispose();
    this.#nodes = [];
    this.#interval?.dispose();
  }

  #registerNodes(): void {
    this.#nodes.push(
      this.#registry.registerNode(
        node(
          'chart:revenue-trend',
          'org.ugp.demo.bi.chart',
          'Revenue trend',
          { namespace: 'charts', id: 'revenue-trend' },
          'dashboard:operating-review',
        ),
      ),
      this.#registry.registerNode(
        node(
          'series:revenue:all',
          'org.ugp.demo.bi.series',
          'Revenue series',
          { namespace: 'series', id: 'revenue:all' },
          'chart:revenue-trend',
        ),
      ),
      this.#registry.registerNode(
        node(
          'chart:region-breakdown',
          'org.ugp.demo.bi.chart',
          'Revenue by region',
          { namespace: 'charts', id: 'region-breakdown' },
          'dashboard:operating-review',
        ),
      ),
    );
    for (const point of this.#dashboard.revenueSeries) {
      this.#nodes.push(
        this.#registry.registerNode(
          node(
            `point:revenue:${point.period}:all`,
            'org.ugp.demo.bi.data-point',
            `Revenue · ${point.period}`,
            { namespace: 'points', id: `revenue:${point.period}:all` },
            'series:revenue:all',
          ),
        ),
      );
    }
    for (const region of this.#dashboard.regionBreakdown) {
      this.#nodes.push(this.#registry.registerNode(this.#regionNode(region)));
    }
  }

  #regionNode(region: DimensionMember): SemanticNode {
    return node(
      `region:${region.id}:chart`,
      'org.ugp.demo.bi.dimension-member',
      region.label,
      { namespace: 'regions', id: region.id },
      'chart:region-breakdown',
    );
  }

  #registerAnchors(): void {
    const revision = this.#registry.surfaceRevision;
    const canvasRect = this.#canvas.getBoundingClientRect();
    this.#anchors.push(
      this.#registry.registerAnchor({
        anchorId: 'canvas:revenue-series',
        nodeId: 'series:revenue:all',
        kind: 'canvas',
        adapterId: 'bi-chart-adapter',
        adapterRevision: this.#dashboard.state.adapterRevision,
        surfaceRevision: revision,
        geometry: {
          kind: 'rect',
          coordinateSpace: 'viewport',
          x: canvasRect.left,
          y: canvasRect.top,
          width: canvasRect.width,
          height: canvasRect.height,
        },
      }),
    );
    for (const [index, point] of this.#dashboard.revenueSeries.entries()) {
      this.#anchors.push(
        this.#registry.registerAnchor({
          anchorId: `canvas:point:${point.period}`,
          nodeId: `point:revenue:${point.period}:all`,
          kind: 'canvas',
          adapterId: 'bi-chart-adapter',
          adapterRevision: this.#dashboard.state.adapterRevision,
          surfaceRevision: revision,
          priority: 20,
          geometry: this.#pointGeometry(index),
        }),
      );
    }
    for (const region of this.#dashboard.regionBreakdown) {
      const element = this.#svg.querySelector<SVGGraphicsElement>(
        `[data-region-id="${region.id}"]`,
      );
      if (!element) continue;
      const rect = element.getBoundingClientRect();
      this.#anchors.push(
        this.#registry.registerAnchor({
          anchorId: `svg:region:${region.id}`,
          nodeId: `region:${region.id}:chart`,
          kind: 'svg',
          elementId: `bar-${region.id}`,
          surfaceRevision: revision,
          priority: 10,
          geometry: {
            kind: 'rect',
            coordinateSpace: 'viewport',
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height,
          },
        }),
      );
    }
  }

  #pointGeometry(index: number) {
    const rect = this.#canvas.getBoundingClientRect();
    const values = this.#dashboard.revenueSeries.map((point) => point.value);
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    const value = values[index] ?? minimum;
    const x =
      rect.left + 28 + (index / (values.length - 1)) * (rect.width - 48);
    const y =
      rect.bottom -
      24 -
      ((value - minimum) / Math.max(1, maximum - minimum)) * (rect.height - 52);
    return {
      kind: 'rect' as const,
      coordinateSpace: 'viewport' as const,
      x: x - 7,
      y: y - 7,
      width: 14,
      height: 14,
    };
  }

  #clearAnchors(): void {
    for (const registration of this.#anchors) registration.dispose();
    this.#anchors = [];
  }
}
