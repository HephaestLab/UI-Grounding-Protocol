import type { Registration, SemanticRegistry } from '@ui-grounding/core';
import type {
  DomAnchorRegistry,
  DomAnchorRegistration,
} from '@ui-grounding/dom';
import type { SemanticNode } from '@ui-grounding/protocol';

import type { OrderRecord } from './model.js';

interface RowRegistration {
  nodes: Registration<SemanticNode>[];
  anchors: DomAnchorRegistration[];
}

export class VirtualOrderTable {
  readonly #viewport: HTMLElement;
  readonly #rowsLayer: HTMLElement;
  readonly #spacer: HTMLElement;
  readonly #registry: SemanticRegistry;
  readonly #domRegistry: DomAnchorRegistry;
  readonly #rowHeight = 36;
  readonly #visibleCount = 8;
  #records: OrderRecord[];
  #registrations: RowRegistration[] = [];

  constructor(options: {
    viewport: HTMLElement;
    registry: SemanticRegistry;
    domRegistry: DomAnchorRegistry;
    records: OrderRecord[];
  }) {
    this.#viewport = options.viewport;
    this.#rowsLayer = options.viewport.querySelector('.virtual-rows')!;
    this.#spacer = options.viewport.querySelector('.virtual-spacer')!;
    this.#registry = options.registry;
    this.#domRegistry = options.domRegistry;
    this.#records = options.records;
    this.#viewport.addEventListener('scroll', this.#render, { passive: true });
    this.#render();
  }

  getItemKey(index: number): string | undefined {
    return this.#records[index]?.id;
  }

  update(records: OrderRecord[]): void {
    this.#records = records;
    this.#viewport.scrollTop = 0;
    this.#render();
  }

  scrollToIndex(index: number): void {
    if (index < 0 || index >= this.#records.length) {
      throw new RangeError('Invalid record index');
    }
    this.#viewport.scrollTop = index * this.#rowHeight;
    this.#render();
  }

  visibleRecord(index = 0): OrderRecord | undefined {
    const start = Math.floor(this.#viewport.scrollTop / this.#rowHeight);
    return this.#records[start + index];
  }

  visibleRow(index = 0): HTMLElement | undefined {
    return this.#rowsLayer.children[index] as HTMLElement | undefined;
  }

  dispose(): void {
    this.#viewport.removeEventListener('scroll', this.#render);
    this.#disposeRows();
  }

  readonly #render = (): void => {
    this.#disposeRows();
    const start = Math.min(
      Math.floor(this.#viewport.scrollTop / this.#rowHeight),
      Math.max(0, this.#records.length - this.#visibleCount),
    );
    const visible = this.#records.slice(start, start + this.#visibleCount);
    this.#spacer.style.height = `${this.#records.length * this.#rowHeight}px`;
    this.#rowsLayer.style.transform = `translateY(${start * this.#rowHeight}px)`;
    this.#rowsLayer.replaceChildren();
    for (const record of visible) {
      const row = document.createElement('div');
      row.className = 'table-row';
      row.dataset.recordId = record.id;
      row.innerHTML = `<b>${record.id.toUpperCase()}</b><span class="region-cell">${record.regionId}</span><span>${record.segmentId}</span><span>$${record.revenue.toLocaleString()}</span><strong>${(record.margin * 100).toFixed(1)}%</strong>`;
      this.#rowsLayer.append(row);
      const recordNodeId = `record:${record.id}`;
      const regionNodeId = `region:${record.regionId}:record:${record.id}`;
      const recordNode = this.#registry.registerNode({
        nodeId: recordNodeId,
        type: 'org.ugp.demo.bi.record',
        label: record.id.toUpperCase(),
        authority: 'authoritative',
        entityRef: { namespace: 'orders', id: record.id },
        anchorIds: [],
        revision: record.revision,
      });
      const regionNode = this.#registry.registerNode({
        nodeId: regionNodeId,
        type: 'org.ugp.demo.bi.dimension-member',
        label: record.regionId,
        authority: 'authoritative',
        entityRef: { namespace: 'regions', id: record.regionId },
        parentNodeId: recordNodeId,
        anchorIds: [],
        revision: record.revision,
      });
      const rowAnchor = this.#domRegistry.register(row, recordNodeId, {
        anchorId: `dom:${recordNodeId}`,
        detectOcclusion: false,
      });
      const regionAnchor = this.#domRegistry.register(
        row.querySelector('.region-cell')!,
        regionNodeId,
        {
          anchorId: `dom:${regionNodeId}`,
          priority: 20,
          detectOcclusion: false,
        },
      );
      this.#registrations.push({
        nodes: [recordNode, regionNode],
        anchors: [rowAnchor, regionAnchor],
      });
    }

    // Row anchors are first measured while the recycled rows are being
    // inserted. Publish final geometry once the browser has completed layout.
    requestAnimationFrame(() => this.#domRegistry.refresh());
  };

  #disposeRows(): void {
    for (const registration of this.#registrations) {
      for (const anchor of registration.anchors) anchor.dispose();
      for (const node of [...registration.nodes].reverse()) node.dispose();
    }
    this.#registrations = [];
  }
}
