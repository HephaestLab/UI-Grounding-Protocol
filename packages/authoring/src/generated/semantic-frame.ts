/* Generated from spec/drafts/v0.2/schemas. Do not edit directly. */

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
  value: SemanticFrame1;
}
export interface SemanticFrame1 {
  type: string;
  subject: Entity;
  roles: {
    [k: string]: SemanticValue;
  };
}
