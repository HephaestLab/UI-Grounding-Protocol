import type { GroundingBundle } from '@ui-grounding/protocol';
import { describe, expect, it } from 'vitest';

import {
  auditBindingProvenance,
  defineBinding,
  defineProfile,
  entityRefFromSubject,
  materializeBinding,
  ProfileRegistry,
  SemanticDescriptionRegistry,
  type AuthorityManifest,
  type ProfileDefinition,
} from './index.js';

const profiles = [
  defineProfile({
    profileId: 'profile:bi',
    version: '1',
    title: 'BI',
    frames: [
      {
        type: 'bi.metric-observation',
        title: 'Metric observation',
        description: 'A metric value under a dimensional scope.',
        roles: {
          metric: { description: 'Metric concept', valueKinds: ['entity'] },
          value: { description: 'Observed value', valueKinds: ['quantity'] },
          scope: { description: 'Dimensional scope', valueKinds: ['frame'] },
          query: { description: 'Query reference', valueKinds: ['entity'] },
        },
        requiredRoles: ['metric', 'value', 'scope'],
        competencyQuestions: [
          {
            id: 'identity',
            question: 'Which observation is this?',
            answerPaths: ['subject'],
            includeInSummary: true,
          },
          {
            id: 'meaning',
            question: 'What was observed under which scope?',
            answerPaths: ['roles.value', 'roles.scope'],
            includeInSummary: true,
          },
        ],
        summaryPlan: { roles: ['value', 'scope'] },
        capabilities: ['bi.describe'],
      },
    ],
  } satisfies ProfileDefinition),
  defineProfile({
    profileId: 'profile:document',
    version: '1',
    title: 'Document',
    frames: [
      {
        type: 'document.contract-clause',
        title: 'Contract clause',
        description: 'A clause with a normative effect.',
        roles: {
          effect: { description: 'Normative effect', valueKinds: ['string'] },
          noticePeriod: {
            description: 'Required notice period',
            valueKinds: ['quantity'],
          },
        },
        requiredRoles: ['effect'],
        competencyQuestions: [
          {
            id: 'identity',
            question: 'Which clause is this?',
            answerPaths: ['subject'],
            includeInSummary: true,
          },
          {
            id: 'meaning',
            question: 'What normative effect does it have?',
            answerPaths: ['roles.effect'],
            includeInSummary: true,
          },
        ],
        summaryPlan: { roles: ['effect'] },
      },
    ],
  } satisfies ProfileDefinition),
  defineProfile({
    profileId: 'profile:workflow',
    version: '1',
    title: 'Workflow',
    frames: [
      {
        type: 'workflow.approval-step',
        title: 'Approval step',
        description: 'A stateful approval step.',
        roles: {
          state: {
            description: 'Workflow state',
            valueKinds: ['string'],
            vocabulary: ['waiting', 'approved', 'rejected'],
          },
          assignee: { description: 'Assigned actor', valueKinds: ['entity'] },
        },
        requiredRoles: ['state', 'assignee'],
        competencyQuestions: [
          {
            id: 'identity',
            question: 'Which workflow step is this?',
            answerPaths: ['subject'],
            includeInSummary: true,
          },
          {
            id: 'meaning',
            question: 'What is its state and assignment?',
            answerPaths: ['roles.state', 'roles.assignee'],
            includeInSummary: true,
          },
        ],
        summaryPlan: { roles: ['state', 'assignee'] },
      },
    ],
  } satisfies ProfileDefinition),
  defineProfile({
    profileId: 'profile:commerce',
    version: '1',
    title: 'Commerce',
    frames: [
      {
        type: 'commerce.order',
        title: 'Order',
        description: 'A commerce order.',
        roles: {
          state: { description: 'Order state', valueKinds: ['string'] },
          total: { description: 'Order total', valueKinds: ['quantity'] },
        },
        requiredRoles: ['state', 'total'],
        competencyQuestions: [
          {
            id: 'identity',
            question: 'Which order is this?',
            answerPaths: ['subject'],
            includeInSummary: true,
          },
          {
            id: 'meaning',
            question: 'What is its current state and total?',
            answerPaths: ['roles.state', 'roles.total'],
            includeInSummary: true,
          },
        ],
        summaryPlan: { roles: ['state', 'total'] },
        capabilities: ['commerce.inspect-order'],
      },
    ],
  } satisfies ProfileDefinition),
] as const;

const commerceBinding = defineBinding<{
  id: string;
  state: string;
  total: number;
  revision: string;
}>({
  bindingId: 'binding:order-row',
  profile: 'profile:commerce',
  frameType: 'commerce.order',
  nodeId: (order) => `order:${order.id}`,
  subject: (order) => ({
    kind: 'entity',
    ref: `orders/${order.id}`,
    type: 'commerce.order',
    label: `Order ${order.id}`,
  }),
  roles: (order) => ({
    state: order.state,
    total: { kind: 'quantity', value: order.total, unit: 'USD' },
  }),
  revision: (order) => order.revision,
  capabilities: ['commerce.inspect-order'],
  provenance: {
    nodeId: ['frontend.order-row'],
    subject: ['domain.orders'],
    roles: {
      state: ['api.orders'],
      total: ['api.orders'],
    },
    revision: ['api.orders'],
    capabilities: {
      'commerce.inspect-order': ['domain.order-capabilities'],
    },
  },
});

const authorityManifest = {
  schemaVersion: '0.2-draft',
  manifestId: 'manifest:commerce-test',
  application: 'commerce-test',
  applicationVersion: '1',
  sources: [
    {
      id: 'frontend.order-row',
      kind: 'typed-props',
      locator: 'src/components/OrderRow.tsx',
      revision: 'test-revision',
    },
    {
      id: 'domain.orders',
      kind: 'domain-model',
      locator: 'src/domain/Order.ts',
      revision: 'test-revision',
    },
    {
      id: 'api.orders',
      kind: 'api-schema',
      locator: 'openapi.json#/Order',
      revision: 'test-revision',
    },
    {
      id: 'domain.order-capabilities',
      kind: 'backend-code',
      locator: 'src/domain/order-capabilities.ts',
      revision: 'test-revision',
    },
  ],
  knownGaps: [],
} satisfies AuthorityManifest;

function grounding(overrides: Partial<GroundingBundle> = {}): GroundingBundle {
  return {
    groundingId: 'grounding:test',
    selection: {
      selectionId: 'selection:test',
      surfaceId: 'surface:orders',
      mode: 'semantic',
      selectors: [{ type: 'UGPSemanticSelector', nodeId: 'order:42' }],
      surfaceRevision: 'surface-r1',
      createdAt: '2026-08-28T00:00:00Z',
      source: 'human',
    },
    referents: [
      {
        nodeId: 'order:42',
        type: 'commerce.order',
        entityRef: { namespace: 'orders', id: '42' },
        label: 'Order 42',
        authority: 'authoritative',
        confidence: 1,
        relation: 'exact',
        evidence: [{ kind: 'semantic-selector', authority: 'authoritative' }],
        surfaceRevision: 'surface-r1',
        nodeRevision: 'order-r3',
      },
    ],
    ambiguity: { requiresDisambiguation: false },
    generatedAt: '2026-08-28T00:00:00Z',
    ...overrides,
  } as GroundingBundle;
}

describe('UGP v0.2 authoring candidate', () => {
  it('uses one frame grammar across four structurally different domains', () => {
    const registry = new ProfileRegistry(profiles);
    expect(
      registry.validateFrame('profile:document', {
        type: 'document.contract-clause',
        subject: {
          kind: 'entity',
          ref: 'clauses/12',
          label: 'Termination clause',
        },
        roles: { effect: 'Either party may terminate with notice.' },
      }),
    ).toEqual({ valid: true, issues: [] });
    expect(
      registry.validateFrame('profile:workflow', {
        type: 'workflow.approval-step',
        subject: { kind: 'entity', ref: 'steps/483', label: 'Approval' },
        roles: {
          state: 'waiting',
          assignee: { kind: 'entity', ref: 'roles/manager' },
        },
      }).valid,
    ).toBe(true);
    expect(
      registry.validateFrame('profile:bi', {
        type: 'bi.metric-observation',
        subject: { kind: 'entity', ref: 'observations/revenue-east-q2' },
        roles: {
          metric: { kind: 'entity', ref: 'metrics/net-revenue' },
          value: { kind: 'quantity', value: 8.431, unit: 'USD-million' },
          scope: {
            kind: 'frame',
            value: {
              type: 'bi.dimension-scope',
              subject: { kind: 'entity', ref: 'scopes/east-q2' },
              roles: { region: 'east', quarter: '2026-Q2' },
            },
          },
        },
      }).valid,
    ).toBe(true);
  });

  it('rejects missing, unknown, and out-of-vocabulary roles', () => {
    const registry = new ProfileRegistry(profiles);
    const result = registry.validateFrame('profile:workflow', {
      type: 'workflow.approval-step',
      subject: { kind: 'entity', ref: 'steps/483' },
      roles: { state: 'invented', extra: true },
    });
    expect(result.valid).toBe(false);
    expect(result.issues).toEqual([
      'Missing required role: assignee',
      'Role state contains an unknown vocabulary value',
      'Unknown role: extra',
      'meaning: Missing competency answer: roles.assignee',
    ]);
  });

  it('materializes a typed sidecar binding and deterministic summary', () => {
    const registry = new ProfileRegistry(profiles);
    const materialized = materializeBinding(registry, commerceBinding, {
      id: '42',
      state: 'pending-payment',
      total: 8431,
      revision: 'order-r3',
    });
    expect(materialized.summary).toBe(
      'Order 42 — State: pending-payment; Total: 8431 USD',
    );
    expect(materialized.nodeId).toBe('order:42');
    expect(materialized.revision).toBe('order-r3');
    expect(materialized.capabilities).toEqual(['commerce.inspect-order']);
    expect(auditBindingProvenance(materialized, authorityManifest)).toEqual({
      valid: true,
      issues: [],
    });
    expect(entityRefFromSubject(materialized.frame.subject)).toEqual({
      namespace: 'orders',
      id: '42',
      type: 'commerce.order',
    });
    expect(
      registry.validateDescription(
        materialized.profile,
        materialized.frame,
        materialized.summary,
      ),
    ).toEqual({ valid: true, issues: [] });
    expect(
      registry.validateDescription(
        materialized.profile,
        materialized.frame,
        'A hand-written summary that drifted from the Frame.',
      ),
    ).toEqual({
      valid: false,
      issues: ['Summary is not the canonical projection of the Frame'],
    });
  });

  it('rejects semantically hollow Profiles and untraceable Binding facts', () => {
    expect(() =>
      defineProfile({
        profileId: 'profile:hollow',
        version: '1',
        title: 'Hollow',
        frames: [
          {
            type: 'test.hollow',
            title: 'Hollow frame',
            description: 'Shape-valid but meaning-incomplete.',
            roles: {
              state: { description: 'State', valueKinds: ['string'] },
              basis: { description: 'Basis', valueKinds: ['string'] },
            },
            requiredRoles: ['state', 'basis'],
            competencyQuestions: [
              {
                id: 'identity',
                question: 'What is it?',
                answerPaths: ['subject'],
                includeInSummary: true,
              },
              {
                id: 'meaning',
                question: 'What does it mean?',
                answerPaths: ['roles.state'],
                includeInSummary: true,
              },
            ],
            summaryPlan: { roles: ['basis'] },
          },
        ],
      }),
    ).toThrow('summary omits competency answer: roles.state');

    expect(() =>
      defineProfile({
        profileId: 'profile:identity-fragment',
        version: '1',
        title: 'Identity fragment',
        frames: [
          {
            type: 'test.identity-fragment',
            title: 'Identity fragment',
            description: 'Uses an identity attribute instead of the subject.',
            roles: {
              meaning: {
                description: 'Referent meaning',
                valueKinds: ['string'],
              },
            },
            requiredRoles: ['meaning'],
            competencyQuestions: [
              {
                id: 'identity',
                question: 'What is it?',
                answerPaths: ['subject.type'],
                includeInSummary: true,
              },
              {
                id: 'meaning',
                question: 'What does it mean?',
                answerPaths: ['roles.meaning'],
                includeInSummary: true,
              },
            ],
            summaryPlan: { roles: ['meaning'] },
          },
        ],
      }),
    ).toThrow('identity must include the canonical subject');

    const materialized = materializeBinding(
      new ProfileRegistry(profiles),
      commerceBinding,
      {
        id: '42',
        state: 'pending-payment',
        total: 8431,
        revision: 'order-r3',
      },
    );
    const incompleteManifest: AuthorityManifest = {
      ...authorityManifest,
      sources: [
        authorityManifest.sources[0],
        authorityManifest.sources[1],
        authorityManifest.sources[3],
      ],
    };
    expect(auditBindingProvenance(materialized, incompleteManifest)).toEqual({
      valid: false,
      issues: ['Undeclared authority source: api.orders'],
    });
  });

  it('rejects capabilities that the selected Profile frame does not declare', () => {
    const registry = new ProfileRegistry(profiles);
    expect(() =>
      materializeBinding(
        registry,
        { ...commerceBinding, capabilities: ['commerce.delete-order'] },
        {
          id: '42',
          state: 'pending-payment',
          total: 8431,
          revision: 'order-r3',
        },
      ),
    ).toThrow('Undeclared capability: commerce.delete-order');
  });

  it('compiles a v0.1 grounding record into a compact Capsule', () => {
    const descriptions = new SemanticDescriptionRegistry(profiles);
    const materialized = materializeBinding(
      descriptions.profiles,
      commerceBinding,
      {
        id: '42',
        state: 'pending-payment',
        total: 8431,
        revision: 'order-r3',
      },
    );
    descriptions.register(materialized.nodeId, () => materialized);
    const capsule = descriptions.createCapsule(grounding());
    expect(capsule).toMatchObject({
      v: '0.2-draft',
      id: 'capsule:grounding:test',
      at: { surface: 'surface:orders', revision: 'surface-r1' },
      referent: { nodeId: 'order:42', revision: 'order-r3' },
      description: {
        profile: 'profile:commerce',
        summary: 'Order 42 — State: pending-payment; Total: 8431 USD',
      },
      can: ['commerce.inspect-order'],
    });
    expect(JSON.stringify(capsule)).not.toContain('selectors');
    expect(JSON.stringify(capsule)).not.toContain('evidence');
  });

  it('rejects a description whose live revision differs from the grounded node', () => {
    const descriptions = new SemanticDescriptionRegistry(profiles);
    const materialized = materializeBinding(
      descriptions.profiles,
      commerceBinding,
      {
        id: '42',
        state: 'pending-payment',
        total: 8431,
        revision: 'order-r4',
      },
    );
    descriptions.register(materialized.nodeId, () => materialized);
    expect(descriptions.createCapsule(grounding()).problem?.code).toBe(
      'invalid-description',
    );
  });

  it('fails closed for stale, missing, ambiguous, and mismatched descriptions', () => {
    const descriptions = new SemanticDescriptionRegistry(profiles);
    expect(
      descriptions.createCapsule(
        grounding({
          referents: [],
          problem: {
            type: 'https://ui-grounding.org/problems/surface-stale',
            title: 'Stale',
            status: 409,
            detail: 'Refresh the surface.',
            code: 'SURFACE_STALE',
            retryable: true,
          },
        }),
      ).problem?.code,
    ).toBe('stale');
    expect(descriptions.createCapsule(grounding()).problem?.code).toBe(
      'no-description',
    );
    const referent = grounding().referents[0]!;
    expect(
      descriptions.createCapsule(
        grounding({ referents: [referent, structuredClone(referent)] }),
      ).problem?.code,
    ).toBe('ambiguous');

    descriptions.register('order:42', () => ({
      bindingId: 'binding:wrong',
      profile: 'profile:commerce',
      nodeId: 'order:42',
      frame: {
        type: 'commerce.order',
        subject: { kind: 'entity', ref: 'orders/99' },
        roles: {
          state: 'pending',
          total: { kind: 'quantity', value: 1, unit: 'USD' },
        },
      },
      summary: 'Wrong order',
      authority: 'authoritative',
      capabilities: [],
      provenance: {
        nodeId: ['frontend.order-row'],
        subject: ['domain.orders'],
        roles: {
          state: ['api.orders'],
          total: ['api.orders'],
        },
      },
    }));
    expect(descriptions.createCapsule(grounding()).problem?.code).toBe(
      'invalid-description',
    );
  });
});
