import type { Registration, SemanticRegistry } from '@ui-grounding/core';
import type { Anchor } from '@ui-grounding/protocol';

import { measureDomElement } from './measurement.js';

type DomAnchor = Extract<Anchor, { kind: 'dom' }>;

export interface DomAnchorOptions {
  anchorId?: string;
  priority?: number;
  detectOcclusion?: boolean;
  signal?: AbortSignal;
}

export interface DomAnchorRegistration {
  readonly anchorId: string;
  refresh(): void;
  dispose(): void;
}

interface ActiveRegistration extends DomAnchorRegistration {
  element: Element;
  refreshScheduled(): void;
}

let anchorSequence = 0;

export class DomAnchorRegistry {
  readonly #registry: SemanticRegistry;
  readonly #surfaceRevision: () => string;
  readonly #byElement = new WeakMap<Element, Set<ActiveRegistration>>();
  readonly #active = new Set<ActiveRegistration>();
  readonly #resizeObserver?: ResizeObserver;
  readonly #intersectionObserver?: IntersectionObserver;
  readonly #handleViewportChange: () => void;
  #disposed = false;

  constructor(options: {
    registry: SemanticRegistry;
    surfaceRevision?: () => string;
  }) {
    this.#registry = options.registry;
    this.#surfaceRevision =
      options.surfaceRevision ?? (() => this.#registry.surfaceRevision);
    this.#handleViewportChange = () => {
      for (const registration of this.#active) registration.refreshScheduled();
    };
    if (typeof ResizeObserver !== 'undefined') {
      this.#resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          for (const registration of this.#byElement.get(entry.target) ?? []) {
            registration.refreshScheduled();
          }
        }
      });
    }
    if (typeof IntersectionObserver !== 'undefined') {
      this.#intersectionObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          for (const registration of this.#byElement.get(entry.target) ?? []) {
            registration.refreshScheduled();
          }
        }
      });
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', this.#handleViewportChange, {
        passive: true,
      });
      document.addEventListener('scroll', this.#handleViewportChange, {
        capture: true,
        passive: true,
      });
    }
  }

  register(
    element: Element,
    nodeId: string,
    options: DomAnchorOptions = {},
  ): DomAnchorRegistration {
    if (this.#disposed) throw new Error('DomAnchorRegistry is disposed');
    if (options.signal?.aborted) {
      throw new DOMException('DOM anchor registration aborted', 'AbortError');
    }
    const anchorId =
      options.anchorId ?? `dom:${nodeId}:${(anchorSequence += 1).toString(36)}`;
    const anchorIds = new Set(
      (element.getAttribute('data-ugp-anchor') ?? '')
        .split(/\s+/u)
        .filter(Boolean),
    );
    anchorIds.add(anchorId);
    element.setAttribute('data-ugp-anchor', [...anchorIds].join(' '));
    let lastSerialized = '';
    let frame: number | undefined;
    let disposed = false;
    let handle: Registration<Anchor> | undefined;
    const createAnchor = (): DomAnchor => {
      const measurement = measureDomElement(element, {
        ...(options.detectOcclusion === undefined
          ? {}
          : { detectOcclusion: options.detectOcclusion }),
      });
      return {
        anchorId,
        nodeId,
        kind: 'dom',
        surfaceRevision: this.#surfaceRevision(),
        ...(options.priority === undefined
          ? {}
          : { priority: options.priority }),
        visibility: measurement.visibility,
        selector: {
          type: 'CssSelector',
          value: `[data-ugp-anchor~="${CSS.escape(anchorId)}"]`,
        },
        ...(measurement.geometry ? { geometry: measurement.geometry } : {}),
      };
    };
    const refresh = (): void => {
      if (disposed) return;
      const anchor = createAnchor();
      const serialized = JSON.stringify(anchor);
      if (serialized === lastSerialized) return;
      lastSerialized = serialized;
      if (handle) handle.update(anchor);
      else handle = this.#registry.registerAnchor(anchor);
    };
    const refreshScheduled = (): void => {
      if (disposed || frame !== undefined) return;
      frame = requestAnimationFrame(() => {
        frame = undefined;
        refresh();
      });
    };
    const registration: ActiveRegistration = {
      anchorId,
      element,
      refresh,
      refreshScheduled,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        if (frame !== undefined) cancelAnimationFrame(frame);
        handle?.dispose();
        this.#active.delete(registration);
        const registrations = this.#byElement.get(element);
        registrations?.delete(registration);
        if (registrations?.size === 0) {
          this.#resizeObserver?.unobserve(element);
          this.#intersectionObserver?.unobserve(element);
        }
        const remainingAnchorIds = new Set(
          (element.getAttribute('data-ugp-anchor') ?? '')
            .split(/\s+/u)
            .filter(Boolean),
        );
        remainingAnchorIds.delete(anchorId);
        if (remainingAnchorIds.size === 0)
          element.removeAttribute('data-ugp-anchor');
        else
          element.setAttribute(
            'data-ugp-anchor',
            [...remainingAnchorIds].join(' '),
          );
        options.signal?.removeEventListener('abort', registration.dispose);
      },
    };
    const registrations = this.#byElement.get(element) ?? new Set();
    registrations.add(registration);
    this.#byElement.set(element, registrations);
    this.#active.add(registration);
    this.#resizeObserver?.observe(element);
    this.#intersectionObserver?.observe(element);
    options.signal?.addEventListener('abort', registration.dispose, {
      once: true,
    });
    refresh();
    return registration;
  }

  refresh(): void {
    for (const registration of this.#active) registration.refresh();
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const registration of [...this.#active]) registration.dispose();
    this.#resizeObserver?.disconnect();
    this.#intersectionObserver?.disconnect();
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.#handleViewportChange);
      document.removeEventListener('scroll', this.#handleViewportChange, true);
    }
  }
}
