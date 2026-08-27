/* Generated from spec/schemas. Do not edit directly. */

export interface ResolvedReferent {
  nodeId: string;
  type: string;
  entityRef?: EntityReference;
  label: string;
  authority: 'authoritative' | 'derived' | 'inferred';
  confidence: number;
  relation:
    | 'exact'
    | 'contains-selection'
    | 'contained-by-selection'
    | 'intersects'
    | 'nearest'
    | 'text-overlap';
  /**
   * @minItems 1
   */
  evidence: [ResolutionEvidence, ...ResolutionEvidence[]];
  surfaceRevision: string;
  nodeRevision?: string;
  ambiguousWith?: string[];
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
export interface ResolutionEvidence {
  kind:
    | 'semantic-selector'
    | 'anchor-hit'
    | 'geometry-overlap'
    | 'text-match'
    | 'adapter-hit'
    | 'accessibility-inference';
  authority: 'authoritative' | 'derived' | 'inferred';
  anchorId?: string;
  score?: number;
  visibleRatio?: number;
  details?: {
    [k: string]: unknown;
  };
}
