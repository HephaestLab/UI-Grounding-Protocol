/* Generated from spec/schemas. Do not edit directly. */

export interface Surface {
  surfaceId: string;
  uri: string;
  title?: string;
  locale?: string;
  revision: string;
  parentSurfaceId?: string;
  trustBoundary: 'same-origin' | 'cross-origin' | 'sandboxed';
  /**
   * @minItems 1
   */
  selectionModes: [
    'point' | 'region' | 'lasso' | 'text' | 'semantic' | 'programmatic',
    ...('point' | 'region' | 'lasso' | 'text' | 'semantic' | 'programmatic')[],
  ];
  /**
   * @minItems 1
   */
  profiles: [string, ...string[]];
  extensions?: Extensions;
}
export interface Extensions {
  [k: string]: unknown;
}
