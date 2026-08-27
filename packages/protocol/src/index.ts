/** The protocol version implemented by this pre-alpha package line. */
export const UGP_PROTOCOL_VERSION = '0.1' as const;

export type UgpProtocolVersion = typeof UGP_PROTOCOL_VERSION;

export type { Anchor } from './generated/anchor.js';
export type { ContextBundle } from './generated/context-bundle.js';
export type { UgpEnvelope } from './generated/envelope.js';
export type { GroundingBundle } from './generated/grounding-bundle.js';
export type { GroundingProblem } from './generated/grounding-problem.js';
export type { ResolvedReferent } from './generated/resolved-referent.js';
export type { Selection } from './generated/selection.js';
export type { Selector } from './generated/selector.js';
export type { SemanticNode } from './generated/semantic-node.js';
export type { SemanticType } from './generated/semantic-type.js';
export type { Surface } from './generated/surface.js';
