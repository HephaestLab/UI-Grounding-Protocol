import type { Anchor, SemanticNode } from '@ui-grounding/protocol';

export interface RegistrySnapshot {
  readonly surfaceId: string;
  readonly surfaceRevision: string;
  readonly semanticRevision: number;
  readonly nodes: readonly SemanticNode[];
  readonly anchors: readonly Anchor[];
}

export interface Registration<T> {
  readonly id: string;
  update(value: T): void;
  dispose(): void;
}

export interface RegistrationOptions {
  signal?: AbortSignal;
}

type Listener = () => void;

function entityKey(node: SemanticNode): string | undefined {
  const reference = node.entityRef;
  return reference ? `${reference.namespace}\u0000${reference.id}` : undefined;
}

function cloneNode(node: SemanticNode): SemanticNode {
  return structuredClone(node);
}

function cloneAnchor(anchor: Anchor): Anchor {
  return structuredClone(anchor);
}

export class SemanticRegistry {
  readonly surfaceId: string;
  #surfaceRevision: string;
  #semanticRevision = 0;
  #nodes = new Map<string, SemanticNode>();
  #anchors = new Map<string, Anchor>();
  #entityIndex = new Map<string, Set<string>>();
  #children = new Map<string, Set<string>>();
  #listeners = new Set<Listener>();
  #cleanups = new Map<string, () => void>();
  #snapshot: RegistrySnapshot;
  #disposed = false;

  constructor(options: { surfaceId: string; surfaceRevision: string }) {
    if (!options.surfaceId) throw new TypeError('surfaceId must not be empty');
    if (!options.surfaceRevision) {
      throw new TypeError('surfaceRevision must not be empty');
    }
    this.surfaceId = options.surfaceId;
    this.#surfaceRevision = options.surfaceRevision;
    this.#snapshot = this.#createSnapshot();
  }

  get surfaceRevision(): string {
    return this.#surfaceRevision;
  }

  get semanticRevision(): number {
    return this.#semanticRevision;
  }

  registerNode(
    value: SemanticNode,
    options: RegistrationOptions = {},
  ): Registration<SemanticNode> {
    this.#assertActive();
    if (this.#nodes.has(value.nodeId)) {
      throw new Error(`SemanticNode already registered: ${value.nodeId}`);
    }
    if (options.signal?.aborted) {
      throw new DOMException('Registration aborted', 'AbortError');
    }
    this.#validateParent(value);
    const node = cloneNode(value);
    this.#nodes.set(node.nodeId, node);
    this.#indexNode(node);
    this.#attachAbort(`node:${node.nodeId}`, options.signal, () => {
      this.unregisterNode(node.nodeId);
    });
    this.#mutated();

    let disposed = false;
    return {
      id: node.nodeId,
      update: (next) => {
        if (disposed) throw new Error('Registration is disposed');
        this.updateNode(node.nodeId, next);
      },
      dispose: () => {
        if (disposed) return;
        disposed = true;
        this.unregisterNode(node.nodeId);
      },
    };
  }

  updateNode(nodeId: string, value: SemanticNode): void {
    this.#assertActive();
    const previous = this.#nodes.get(nodeId);
    if (!previous) throw new Error(`Unknown SemanticNode: ${nodeId}`);
    if (value.nodeId !== nodeId) throw new Error('nodeId cannot be changed');
    this.#validateParent(value);
    this.#unindexNode(previous);
    const next = cloneNode(value);
    this.#nodes.set(nodeId, next);
    this.#indexNode(next);
    this.#mutated();
  }

  unregisterNode(nodeId: string): boolean {
    this.#assertActive();
    const node = this.#nodes.get(nodeId);
    if (!node) return false;
    for (const anchor of [...this.#anchors.values()]) {
      if (anchor.nodeId === nodeId) this.unregisterAnchor(anchor.anchorId);
    }
    this.#runCleanup(`node:${nodeId}`);
    this.#unindexNode(node);
    this.#nodes.delete(nodeId);
    this.#mutated();
    return true;
  }

  registerAnchor(
    value: Anchor,
    options: RegistrationOptions = {},
  ): Registration<Anchor> {
    this.#assertActive();
    if (this.#anchors.has(value.anchorId)) {
      throw new Error(`Anchor already registered: ${value.anchorId}`);
    }
    if (!this.#nodes.has(value.nodeId)) {
      throw new Error(
        `Anchor references unknown SemanticNode: ${value.nodeId}`,
      );
    }
    if (options.signal?.aborted) {
      throw new DOMException('Registration aborted', 'AbortError');
    }
    const anchor = cloneAnchor(value);
    this.#anchors.set(anchor.anchorId, anchor);
    this.#attachAbort(`anchor:${anchor.anchorId}`, options.signal, () => {
      this.unregisterAnchor(anchor.anchorId);
    });
    this.#mutated();

    let disposed = false;
    return {
      id: anchor.anchorId,
      update: (next) => {
        if (disposed) throw new Error('Registration is disposed');
        this.updateAnchor(anchor.anchorId, next);
      },
      dispose: () => {
        if (disposed) return;
        disposed = true;
        this.unregisterAnchor(anchor.anchorId);
      },
    };
  }

  updateAnchor(anchorId: string, value: Anchor): void {
    this.#assertActive();
    if (!this.#anchors.has(anchorId)) {
      throw new Error(`Unknown Anchor: ${anchorId}`);
    }
    if (value.anchorId !== anchorId)
      throw new Error('anchorId cannot be changed');
    if (!this.#nodes.has(value.nodeId)) {
      throw new Error(
        `Anchor references unknown SemanticNode: ${value.nodeId}`,
      );
    }
    this.#anchors.set(anchorId, cloneAnchor(value));
    this.#mutated();
  }

  unregisterAnchor(anchorId: string): boolean {
    this.#assertActive();
    if (!this.#anchors.delete(anchorId)) return false;
    this.#runCleanup(`anchor:${anchorId}`);
    this.#mutated();
    return true;
  }

  setSurfaceRevision(revision: string): void {
    this.#assertActive();
    if (!revision) throw new TypeError('surfaceRevision must not be empty');
    if (revision === this.#surfaceRevision) return;
    this.#surfaceRevision = revision;
    this.#mutated();
  }

  getNode(nodeId: string): SemanticNode | undefined {
    const node = this.#nodes.get(nodeId);
    return node ? cloneNode(node) : undefined;
  }

  getAnchor(anchorId: string): Anchor | undefined {
    const anchor = this.#anchors.get(anchorId);
    return anchor ? cloneAnchor(anchor) : undefined;
  }

  findByEntityRef(namespace: string, id: string): SemanticNode[] {
    const ids = this.#entityIndex.get(`${namespace}\u0000${id}`) ?? [];
    return [...ids]
      .map((nodeId) => this.#nodes.get(nodeId))
      .filter((node): node is SemanticNode => node !== undefined)
      .map(cloneNode);
  }

  getChildren(nodeId: string): SemanticNode[] {
    const ids = this.#children.get(nodeId) ?? [];
    return [...ids]
      .map((childId) => this.#nodes.get(childId))
      .filter((node): node is SemanticNode => node !== undefined)
      .map(cloneNode);
  }

  getSnapshot = (): RegistrySnapshot => this.#snapshot;

  subscribe = (listener: Listener): (() => void) => {
    this.#assertActive();
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  dispose(): void {
    if (this.#disposed) return;
    for (const cleanup of this.#cleanups.values()) cleanup();
    this.#cleanups.clear();
    this.#nodes.clear();
    this.#anchors.clear();
    this.#entityIndex.clear();
    this.#children.clear();
    this.#listeners.clear();
    this.#disposed = true;
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error('SemanticRegistry is disposed');
  }

  #validateParent(node: SemanticNode): void {
    if (node.parentNodeId === node.nodeId) {
      throw new Error('SemanticNode cannot be its own parent');
    }
  }

  #indexNode(node: SemanticNode): void {
    const key = entityKey(node);
    if (key) {
      const nodes = this.#entityIndex.get(key) ?? new Set<string>();
      nodes.add(node.nodeId);
      this.#entityIndex.set(key, nodes);
    }
    if (node.parentNodeId) {
      const children =
        this.#children.get(node.parentNodeId) ?? new Set<string>();
      children.add(node.nodeId);
      this.#children.set(node.parentNodeId, children);
    }
  }

  #unindexNode(node: SemanticNode): void {
    const key = entityKey(node);
    if (key) {
      const nodes = this.#entityIndex.get(key);
      nodes?.delete(node.nodeId);
      if (nodes?.size === 0) this.#entityIndex.delete(key);
    }
    if (node.parentNodeId) {
      const children = this.#children.get(node.parentNodeId);
      children?.delete(node.nodeId);
      if (children?.size === 0) this.#children.delete(node.parentNodeId);
    }
  }

  #attachAbort(
    key: string,
    signal: AbortSignal | undefined,
    abort: () => void,
  ): void {
    if (!signal) return;
    signal.addEventListener('abort', abort, { once: true });
    this.#cleanups.set(key, () => signal.removeEventListener('abort', abort));
  }

  #runCleanup(key: string): void {
    this.#cleanups.get(key)?.();
    this.#cleanups.delete(key);
  }

  #mutated(): void {
    this.#semanticRevision += 1;
    this.#snapshot = this.#createSnapshot();
    for (const listener of [...this.#listeners]) listener();
  }

  #createSnapshot(): RegistrySnapshot {
    return Object.freeze({
      surfaceId: this.surfaceId,
      surfaceRevision: this.#surfaceRevision,
      semanticRevision: this.#semanticRevision,
      nodes: Object.freeze([...this.#nodes.values()].map(cloneNode)),
      anchors: Object.freeze([...this.#anchors.values()].map(cloneAnchor)),
    });
  }
}
