import type { GroundingBundle } from '@ui-grounding/protocol';

import type { MaterializedBinding } from './binding.js';
import type { GroundingCapsule } from './generated/grounding-capsule.js';
import type { ProfileDefinition } from './generated/profile-definition.js';
import { ProfileRegistry } from './profile.js';

export type DescriptionProvider = () => MaterializedBinding;

export interface DescriptionRegistration {
  readonly nodeId: string;
  dispose(): void;
}

function canonicalReferent(
  referent: GroundingBundle['referents'][number],
): string | undefined {
  return referent.entityRef
    ? `${referent.entityRef.namespace}/${referent.entityRef.id}`
    : undefined;
}

function groundingProblem(
  grounding: GroundingBundle,
): GroundingCapsule['problem'] | undefined {
  switch (grounding.problem?.code) {
    case 'SURFACE_STALE':
    case 'ANCHOR_STALE':
      return {
        code: 'stale',
        message: grounding.problem.detail,
        retryable: true,
      };
    case 'AMBIGUOUS_REFERENT':
      return {
        code: 'ambiguous',
        message: grounding.problem.detail,
        retryable: false,
      };
    case 'NO_REFERENT':
      return {
        code: 'no-referent',
        message: grounding.problem.detail,
        retryable: grounding.problem.retryable,
      };
    default:
      return undefined;
  }
}

function emptyCapsule(
  grounding: GroundingBundle,
  problem: NonNullable<GroundingCapsule['problem']>,
): GroundingCapsule {
  return {
    v: '0.2-draft',
    id: `capsule:${grounding.groundingId}`,
    at: {
      surface: grounding.selection.surfaceId,
      revision: grounding.selection.surfaceRevision,
    },
    description: null,
    can: [],
    problem,
  };
}

export class SemanticDescriptionRegistry {
  readonly profiles: ProfileRegistry;
  #providers = new Map<string, DescriptionProvider>();
  #disposed = false;

  constructor(profiles: readonly ProfileDefinition[] = []) {
    this.profiles = new ProfileRegistry(profiles);
  }

  registerProfile(profile: ProfileDefinition): () => void {
    this.#assertActive();
    return this.profiles.register(profile);
  }

  register(
    nodeId: string,
    provider: DescriptionProvider,
  ): DescriptionRegistration {
    this.#assertActive();
    if (this.#providers.has(nodeId)) {
      throw new Error(`Description already registered: ${nodeId}`);
    }
    this.#providers.set(nodeId, provider);
    let disposed = false;
    return {
      nodeId,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        this.#providers.delete(nodeId);
      },
    };
  }

  createCapsule(grounding: GroundingBundle): GroundingCapsule {
    this.#assertActive();
    const problem = groundingProblem(grounding);
    if (problem) return emptyCapsule(grounding, problem);
    if (grounding.referents.length === 0) {
      return emptyCapsule(grounding, {
        code: 'no-referent',
        message: 'The selection did not resolve to an application referent.',
        retryable: false,
      });
    }
    if (grounding.referents.length > 1) {
      return emptyCapsule(grounding, {
        code: 'ambiguous',
        message: 'The selection resolved to multiple application referents.',
        retryable: false,
      });
    }
    const referent = grounding.referents[0]!;
    const provider = this.#providers.get(referent.nodeId);
    if (!provider) {
      return emptyCapsule(grounding, {
        code: 'no-description',
        message: 'The referent has no registered semantic description.',
        retryable: false,
      });
    }
    try {
      const binding = provider();
      const expected = canonicalReferent(referent);
      if (expected && binding.frame.subject.ref !== expected) {
        throw new Error('Binding subject does not match the grounded entity');
      }
      if (binding.nodeId !== referent.nodeId) {
        throw new Error('Binding node does not match the grounded node');
      }
      if (referent.nodeRevision && binding.revision !== referent.nodeRevision) {
        throw new Error('Binding revision does not match the grounded node');
      }
      return {
        v: '0.2-draft',
        id: `capsule:${grounding.groundingId}`,
        at: {
          surface: grounding.selection.surfaceId,
          revision: grounding.selection.surfaceRevision,
        },
        description: {
          profile: binding.profile,
          summary: binding.summary,
          frame: structuredClone(binding.frame),
        },
        can: [...binding.capabilities],
      };
    } catch {
      return emptyCapsule(grounding, {
        code: 'invalid-description',
        message: 'The registered semantic description failed validation.',
        retryable: false,
      });
    }
  }

  dispose(): void {
    this.#providers.clear();
    this.#disposed = true;
  }

  #assertActive(): void {
    if (this.#disposed) {
      throw new Error('SemanticDescriptionRegistry is disposed');
    }
  }
}
