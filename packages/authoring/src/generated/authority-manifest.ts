/* Generated from spec/drafts/v0.2/schemas. Do not edit directly. */

export interface AuthorityManifest {
  schemaVersion: '0.2-draft';
  manifestId: string;
  application: string;
  applicationVersion: string;
  /**
   * @minItems 1
   */
  sources: [Source, ...Source[]];
  knownGaps: string[];
}
export interface Source {
  id: string;
  kind:
    | 'domain-model'
    | 'backend-code'
    | 'api-schema'
    | 'official-docs'
    | 'validated-live-state'
    | 'typed-props'
    | 'translation-catalog';
  locator: string;
  revision: string;
}
