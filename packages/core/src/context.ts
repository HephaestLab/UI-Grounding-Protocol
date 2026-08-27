import type {
  ContextBundle,
  GroundingBundle,
  ResolvedReferent,
  SemanticNode,
} from '@ui-grounding/protocol';

type ContextDescriptor = NonNullable<
  SemanticNode['contextDescriptors']
>[number];
type ReferentContext = ContextBundle['referentContexts'][number];
type OmittedContext = NonNullable<ReferentContext['omitted']>[number];

export interface ContextMaterializeRequest {
  referent: ResolvedReferent;
  descriptor: ContextDescriptor;
  principalRef?: string;
  purpose: string;
  signal: AbortSignal;
}

export type ContextMaterializer = (
  request: ContextMaterializeRequest,
) => unknown | Promise<unknown>;

export type ContextAuthorizer = (request: {
  referent: ResolvedReferent;
  descriptor: ContextDescriptor;
  principalRef?: string;
  purpose: string;
}) => boolean | Promise<boolean>;

export interface ContextRegistrationOptions {
  nodeRevision?: string;
  signal?: AbortSignal;
  validate?: (value: unknown) => boolean;
}

export interface MaterializeContextRequest {
  grounding: GroundingBundle;
  principalRef?: string;
  purpose: string;
  requestedContexts?: readonly string[];
  budgetBytes: number;
  signal: AbortSignal;
  authorize: ContextAuthorizer;
}

interface ProviderEntry {
  descriptor: ContextDescriptor;
  materializer: ContextMaterializer;
  nodeRevision?: string;
  validate?: (value: unknown) => boolean;
  cleanup?: () => void;
}

const encoder = new TextEncoder();

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted)
    throw new DOMException('Context request aborted', 'AbortError');
}

function jsonBytes(value: unknown): number | undefined {
  try {
    const serialized = JSON.stringify(value);
    return serialized === undefined
      ? undefined
      : encoder.encode(serialized).byteLength;
  } catch {
    return undefined;
  }
}

export class ContextRegistry {
  #providers = new Map<string, Map<string, ProviderEntry>>();
  #clock: () => Date;
  #disposed = false;

  constructor(options: { clock?: () => Date } = {}) {
    this.#clock = options.clock ?? (() => new Date());
  }

  register(
    nodeId: string,
    descriptor: ContextDescriptor,
    materializer: ContextMaterializer,
    options: ContextRegistrationOptions = {},
  ): () => void {
    this.#assertActive();
    if (!nodeId) throw new TypeError('nodeId must not be empty');
    if (options.signal?.aborted) {
      throw new DOMException('Context registration aborted', 'AbortError');
    }
    const entries =
      this.#providers.get(nodeId) ?? new Map<string, ProviderEntry>();
    if (entries.has(descriptor.name)) {
      throw new Error(
        `Context already registered: ${nodeId}/${descriptor.name}`,
      );
    }
    const entry: ProviderEntry = {
      descriptor: structuredClone(descriptor),
      materializer,
      ...(options.nodeRevision ? { nodeRevision: options.nodeRevision } : {}),
      ...(options.validate ? { validate: options.validate } : {}),
    };
    let disposed = false;
    const dispose = (): void => {
      if (disposed) return;
      disposed = true;
      entry.cleanup?.();
      entries.delete(descriptor.name);
      if (entries.size === 0) this.#providers.delete(nodeId);
    };
    if (options.signal) {
      options.signal.addEventListener('abort', dispose, { once: true });
      entry.cleanup = () =>
        options.signal?.removeEventListener('abort', dispose);
    }
    entries.set(descriptor.name, entry);
    this.#providers.set(nodeId, entries);
    return dispose;
  }

  async materialize(
    request: MaterializeContextRequest,
  ): Promise<ContextBundle> {
    this.#assertActive();
    throwIfAborted(request.signal);
    if (!Number.isSafeInteger(request.budgetBytes) || request.budgetBytes < 0) {
      throw new RangeError('budgetBytes must be a non-negative safe integer');
    }
    const requested = request.requestedContexts
      ? new Set(request.requestedContexts)
      : undefined;
    const referentContexts: ReferentContext[] = [];
    let emittedBytes = 0;
    let truncated = false;
    let filtered = false;

    for (const referent of request.grounding.referents) {
      throwIfAborted(request.signal);
      const entries = this.#providers.get(referent.nodeId);
      if (!entries) continue;
      const contexts: Record<string, unknown> = {};
      const omitted: OmittedContext[] = [];
      let generatedAt = this.#clock();
      let validUntil: Date | undefined;

      for (const [name, entry] of [...entries].sort(([first], [second]) =>
        first.localeCompare(second),
      )) {
        if (requested && !requested.has(name)) continue;
        throwIfAborted(request.signal);
        if (
          entry.nodeRevision &&
          entry.nodeRevision !== referent.nodeRevision
        ) {
          omitted.push({ name, reason: 'stale' });
          continue;
        }
        const authorized = await request.authorize({
          referent,
          descriptor: structuredClone(entry.descriptor),
          ...(request.principalRef
            ? { principalRef: request.principalRef }
            : {}),
          purpose: request.purpose,
        });
        throwIfAborted(request.signal);
        if (!authorized) {
          filtered = true;
          omitted.push({ name, reason: 'unauthorized' });
          continue;
        }

        let value: unknown;
        try {
          value = await entry.materializer({
            referent,
            descriptor: structuredClone(entry.descriptor),
            ...(request.principalRef
              ? { principalRef: request.principalRef }
              : {}),
            purpose: request.purpose,
            signal: request.signal,
          });
        } catch {
          throwIfAborted(request.signal);
          omitted.push({ name, reason: 'unavailable' });
          continue;
        }
        throwIfAborted(request.signal);
        const bytes = jsonBytes({ [name]: value });
        if (bytes === undefined || (entry.validate && !entry.validate(value))) {
          omitted.push({ name, reason: 'unavailable' });
          continue;
        }
        if (emittedBytes + bytes > request.budgetBytes) {
          truncated = true;
          omitted.push({ name, reason: 'budget' });
          continue;
        }
        contexts[name] = value;
        emittedBytes += bytes;
        generatedAt = this.#clock();
        if (entry.descriptor.maxAgeMs !== undefined) {
          const candidate = new Date(
            generatedAt.getTime() + entry.descriptor.maxAgeMs,
          );
          if (!validUntil || candidate < validUntil) validUntil = candidate;
        }
      }

      if (Object.keys(contexts).length > 0 || omitted.length > 0) {
        referentContexts.push({
          nodeId: referent.nodeId,
          ...(referent.entityRef ? { entityRef: referent.entityRef } : {}),
          contexts,
          freshness: {
            generatedAt: generatedAt.toISOString(),
            ...(validUntil ? { validUntil: validUntil.toISOString() } : {}),
          },
          ...(omitted.length > 0 ? { omitted } : {}),
        });
      }
    }

    const sortedRequested = [...(requested ?? [])].sort().join(',');
    return {
      contextId: `context:${request.grounding.groundingId}:${sortedRequested || 'default'}`,
      groundingId: request.grounding.groundingId,
      referentContexts: referentContexts.slice(
        0,
        20,
      ) as ContextBundle['referentContexts'],
      budget: {
        requestedBytes: request.budgetBytes,
        emittedBytes,
        truncated,
      },
      authorization: {
        ...(request.principalRef ? { principalRef: request.principalRef } : {}),
        purpose: request.purpose,
        filtered,
      },
      generatedAt: this.#clock().toISOString(),
    };
  }

  dispose(): void {
    if (this.#disposed) return;
    for (const entries of this.#providers.values()) {
      for (const entry of entries.values()) entry.cleanup?.();
    }
    this.#providers.clear();
    this.#disposed = true;
  }

  #assertActive(): void {
    if (this.#disposed) throw new Error('ContextRegistry is disposed');
  }
}
