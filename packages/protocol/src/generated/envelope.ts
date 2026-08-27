/* Generated from spec/schemas. Do not edit directly. */

export interface UgpEnvelope {
  ugpVersion: '0.1';
  messageId: string;
  type: string;
  surfaceId: string;
  timestamp: string;
  traceparent?: string;
  payload: unknown;
  extensions?: Extensions;
}
export interface Extensions {
  [k: string]: unknown;
}
