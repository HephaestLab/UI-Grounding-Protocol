/* Generated from spec/schemas. Do not edit directly. */

export interface SemanticNode {
  nodeId: string;
  type: string;
  label: string;
  description?: string;
  authority: 'authoritative' | 'derived' | 'inferred';
  entityRef?: EntityReference;
  parentNodeId?: string;
  childNodeIds?: string[];
  anchorIds: string[];
  contextDescriptors?: ContextDescriptor[];
  capabilityRefs?: CapabilityReference[];
  resourceRefs?: ResourceReference[];
  tags?: string[];
  revision?: string;
  validAt?: string;
  expiresAt?: string;
  extensions?: Extensions;
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
export interface ContextDescriptor {
  name: string;
  description: string;
  schema: {
    [k: string]: unknown;
  };
  sensitivity: 'public' | 'internal' | 'confidential' | 'restricted';
  freshness: 'snapshot' | 'live' | 'on-demand';
  maxAgeMs?: number;
  estimatedBytes?: number;
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
export interface ResourceReference {
  resourceId: string;
  uri: string;
  mediaType?: string;
  title?: string;
  expiresAt?: string;
  extensions?: Extensions;
}
