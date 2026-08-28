/* Generated from spec/drafts/v0.2/schemas. Do not edit directly. */

export interface ProfileDefinition {
  profileId: string;
  version: string;
  title: string;
  description?: string;
  /**
   * @minItems 1
   */
  frames: [FrameDefinition, ...FrameDefinition[]];
}
export interface FrameDefinition {
  type: string;
  title: string;
  description: string;
  roles: {
    [k: string]: RoleDefinition;
  };
  requiredRoles: string[];
  summaryTemplate: string;
  capabilities?: string[];
}
export interface RoleDefinition {
  description: string;
  /**
   * @minItems 1
   */
  valueKinds: [
    (
      | 'string'
      | 'number'
      | 'boolean'
      | 'null'
      | 'entity'
      | 'quantity'
      | 'instant'
      | 'interval'
      | 'collection'
      | 'frame'
    ),
    ...(
      | 'string'
      | 'number'
      | 'boolean'
      | 'null'
      | 'entity'
      | 'quantity'
      | 'instant'
      | 'interval'
      | 'collection'
      | 'frame'
    )[],
  ];
  /**
   * @minItems 1
   */
  vocabulary?: [string, ...string[]];
}
