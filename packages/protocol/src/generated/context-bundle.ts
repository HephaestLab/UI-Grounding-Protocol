/* Generated from spec/schemas. Do not edit directly. */

export interface ContextBundle {
  contextId: string;
  groundingId: string;
  /**
   * @maxItems 20
   */
  referentContexts:
    | []
    | [ReferentContext]
    | [ReferentContext, ReferentContext]
    | [ReferentContext, ReferentContext, ReferentContext]
    | [ReferentContext, ReferentContext, ReferentContext, ReferentContext]
    | [
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
      ]
    | [
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
      ]
    | [
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
      ]
    | [
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
      ]
    | [
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
      ]
    | [
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
      ]
    | [
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
      ]
    | [
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
      ]
    | [
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
      ]
    | [
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
      ]
    | [
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
      ]
    | [
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
      ]
    | [
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
      ]
    | [
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
      ]
    | [
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
      ]
    | [
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
        ReferentContext,
      ];
  resources?: ResourceReference[];
  capabilityRefs?: CapabilityReference[];
  budget: {
    requestedBytes: number;
    emittedBytes: number;
    truncated: boolean;
  };
  authorization: {
    principalRef?: string;
    purpose: string;
    filtered: boolean;
  };
  generatedAt: string;
  extensions?: Extensions;
}
export interface ReferentContext {
  nodeId: string;
  entityRef?: EntityReference;
  contexts: {
    [k: string]: unknown;
  };
  freshness: {
    generatedAt: string;
    validUntil?: string;
  };
  omitted?: {
    name: string;
    reason: 'unauthorized' | 'budget' | 'unavailable' | 'stale' | 'cancelled';
  }[];
}
export interface EntityReference {
  namespace: string;
  id: string;
  type?: string;
  revision?: string;
  extensions?: Extensions;
}
export interface Extensions {
  [k: string]: unknown;
}
export interface ResourceReference {
  resourceId: string;
  uri: string;
  mediaType?: string;
  title?: string;
  expiresAt?: string;
  extensions?: Extensions;
}
export interface CapabilityReference {
  provider: string;
  capabilityId: string;
  uri?: string;
  targetBindings?: {
    [k: string]: string;
  };
  discoveryHint?: string;
  extensions?: Extensions;
}
