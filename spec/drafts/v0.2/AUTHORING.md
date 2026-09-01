# UGP v0.2 authoring contract

Status: research draft. This contract governs both greenfield construction and
minimum-change retrofit.

## 1. Required artifacts

Both workflows produce the same sidecar structure. A project may combine small
files, but it must preserve these responsibilities:

```text
src/ugp/
  manifest.ts       # profiles, surfaces, and capability identifiers
  authority.json    # frozen sources, revisions, and known semantic gaps
  profiles/         # domain vocabulary and frame constraints
  bindings/         # application data -> SemanticFrame mappings
  capabilities/     # host-owned discovery metadata and adapters
  surfaces/         # route/surface registration
  tests/            # round-trip and negative cases
```

View components contain only a typed link to a Binding. Frame definitions,
summary prose, API routes, credentials, authorization checks, and tool execution
must remain outside view components.

## 2. Semantic source order

An authoring agent must trace each fact to the highest available authority:

1. domain model, business glossary, semantic layer, or state machine;
2. API schema and documented API behavior;
3. validated application state and typed component props;
4. visible DOM, accessibility tree, or rendered text.

Rendered text may supply a display label. It cannot by itself establish
canonical identity, business meaning, authority, current state semantics,
permission, or an executable capability.

If a required fact has no authoritative source, omit it and record a semantic
gap. Never repair a gap by inventing a value or copying an ambiguous label.

The Authority Manifest records a stable source ID, kind, locator, and version or
digest. Each Binding maps node identity, subject, every role, revision, and
capability to one or more of those source IDs. A source list that exists only at
application level, without fact-level citations, is insufficient.

## 3. Profile rule

A Profile defines domain vocabulary without modifying Core. Every frame type
defines:

- a subject type;
- named roles and allowed value kinds;
- required roles;
- competency questions and the paths that answer them;
- a canonical summary role plan;
- optional capability identifiers.

Add a Profile, role, vocabulary value, or capability adapter for new domain
meaning. Do not add a domain-specific top-level field to `GroundingCapsule`,
`SemanticFrame`, or `SemanticValue`.

Every frame has mandatory `identity` and `meaning` competency questions. A
Profile adds referent-relevant questions such as current value/state, scope,
basis, relation, precondition, effect, completion evidence, or constraint.
Question answer roles are required roles. `identity` and `meaning` answers must
appear in the summary. Questions are defined from application meaning, never
from the current benchmark task.

## 4. Binding rule

A Binding maps live application data to:

- stable `nodeId`;
- canonical entity subject;
- one Profile frame type;
- role values;
- optional data revision;
- capability identifiers.
- fact-level provenance for every item above.

The summary is rendered as a canonical `subject — Role: value` projection from
the validated frame and Profile `summaryPlan`. The plan only selects required
roles and cannot contain labels or arbitrary factual literals. The summary is
not independently authored or stored as a second source of truth.

```ts
export const orderBinding = defineBinding<Order>({
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
    total: { kind: 'quantity', value: order.total, unit: order.currency },
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
```

## 5. Component link

For React, the normal link is one hook and one ref:

```tsx
function OrderRow({ order }: { order: Order }) {
  const ugp = useUgpLink(orderBinding, order);
  return <button ref={ugp.ref}>Order {order.id}</button>;
}
```

Other frameworks must preserve the same lifecycle: register the node,
description provider, and visible anchor together; update them from live data;
dispose them on unmount. Static copied JSON is not a valid substitute for a live
binding.

Each meaning-bearing linked component must be independently describable. A
surface index may help consumers discover child node IDs and summaries, but a
single page-level Description containing every control is not a substitute for
the selected component's Capsule.

Keep interaction mechanics separate. Transient target IDs and exact action
arguments belong to the visible or host interaction Binding. The semantic Frame
contains application meaning, current business state, and—when the control
itself is the referent—its business effect, preconditions, and completion
evidence.

## 6. Capability boundary

`can` contains stable capability identifiers. It does not contain credentials,
bearer tokens, or permission claims. The host resolves an identifier to its
current schema or adapter, validates arguments, re-authorizes the current user,
obtains confirmation where required, executes the operation, and records its own
audit trail.

UGP selection, Capsule generation, and the optional Inspector must work when no
capability executor or model loop is installed.

## 7. Required verification

For every linked referent, verify:

1. Profile validation accepts the intended frame and rejects missing required
   roles, unknown roles, invalid kinds, unknown vocabulary values, missing
   `identity`/`meaning` answers, and summaries that omit required answers.
2. A visible selection resolves to the exact node and canonical entity. The
   Capsule `referent.nodeId` and optional node revision preserve that link; `at`
   continues to identify the containing surface.
3. Capsule summary and frame change when authoritative application data or its
   revision changes.
4. Every emitted semantic fact cites a declared Authority Manifest source.
5. A component selection returns that component's canonical subject and
   Description, not a generic surface aggregate.
6. Missing, stale, ambiguous, and mismatched descriptions fail closed.
7. Capsule output contains no geometry, selector evidence, transient action
   target, credential, or raw API response duplication.
8. Unmount removes the node, anchor, and description provider.
9. Existing functional, accessibility, and visual acceptance remains green.

The delivery report lists linked referents, Profiles, capabilities, semantic
gaps, tests run, and any intentionally unsupported surface.
