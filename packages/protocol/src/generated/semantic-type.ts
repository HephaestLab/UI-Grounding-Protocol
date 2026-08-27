/* Generated from spec/schemas. Do not edit directly. */

export interface SemanticType {
  type: string;
  title: string;
  description: string;
  version: string;
  schema?: {
    [k: string]: unknown;
  };
  extends?: string[];
  extensions?: Extensions;
}
export interface Extensions {
  [k: string]: unknown;
}
