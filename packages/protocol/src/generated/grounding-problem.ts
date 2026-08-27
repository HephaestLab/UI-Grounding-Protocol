/* Generated from spec/schemas. Do not edit directly. */

export interface GroundingProblem {
  type: string;
  title: string;
  status?: number;
  detail: string;
  code:
    | 'SURFACE_STALE'
    | 'SELECTION_INVALID'
    | 'NO_REFERENT'
    | 'AMBIGUOUS_REFERENT'
    | 'ANCHOR_STALE'
    | 'CONTEXT_UNAUTHORIZED'
    | 'CONTEXT_BUDGET_EXCEEDED'
    | 'ADAPTER_UNAVAILABLE';
  retryable: boolean;
  invalidParams?: {
    path: string;
    reason: string;
  }[];
  recovery?: string;
  extensions?: Extensions;
}
export interface Extensions {
  [k: string]: unknown;
}
