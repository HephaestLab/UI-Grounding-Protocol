/* Generated from spec/drafts/v0.2/schemas. Do not edit directly. */

export type GroundingCapsule = {
  [k: string]: unknown;
} & {
  v: '0.2-draft';
  id: string;
  at: {
    surface: string;
    revision: string;
  };
  referent: Referent | null;
  description: Description | null;
  can: string[];
  problem?: Problem;
};
export type SemanticValue =
  | string
  | number
  | boolean
  | null
  | Entity
  | Quantity
  | Instant
  | Interval
  | Collection
  | NestedFrame;

export interface Referent {
  nodeId: string;
  revision?: string;
}
export interface Description {
  profile: string;
  /**
   * Canonical Profile summaryPlan projection of the normative frame; it MUST NOT introduce facts.
   */
  summary: string;
  frame: SemanticFrame;
}
export interface SemanticFrame {
  type: string;
  subject: Entity;
  roles: {
    [k: string]: SemanticValue;
  };
}
export interface Entity {
  kind: 'entity';
  ref: string;
  type?: string;
  label?: string;
}
export interface Quantity {
  kind: 'quantity';
  value: number;
  unit: string;
}
export interface Instant {
  kind: 'instant';
  value: string;
}
export interface Interval {
  kind: 'interval';
  start: string;
  endExclusive?: string;
  label?: string;
}
export interface Collection {
  kind: 'collection';
  /**
   * @maxItems 100
   */
  items: SemanticValue[];
}
export interface NestedFrame {
  kind: 'frame';
  value: SemanticFrame;
}
export interface Problem {
  code:
    | 'ambiguous'
    | 'stale'
    | 'no-referent'
    | 'no-description'
    | 'invalid-description'
    | 'unauthorized';
  message: string;
  retryable: boolean;
}
