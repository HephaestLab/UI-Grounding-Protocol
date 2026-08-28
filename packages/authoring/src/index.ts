export {
  defineBinding,
  entityRefFromSubject,
  materializeBinding,
  type MaterializedBinding,
  type SemanticBinding,
} from './binding.js';
export type { GroundingCapsule } from './generated/grounding-capsule.js';
export type { ProfileDefinition } from './generated/profile-definition.js';
export type { SemanticFrame } from './generated/semantic-frame.js';
export type { SemanticValue } from './generated/semantic-value.js';
export {
  defineProfile,
  ProfileRegistry,
  type FrameValidationResult,
} from './profile.js';
export {
  SemanticDescriptionRegistry,
  type DescriptionProvider,
  type DescriptionRegistration,
} from './registry.js';
export const UGP_SEMANTIC_DRAFT_VERSION = '0.2-draft' as const;
