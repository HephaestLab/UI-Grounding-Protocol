# UGP v0.2 authoring contract

Status: research draft. This contract governs both greenfield construction and
minimum-change retrofit.

## 1. Required artifacts

Both workflows produce the same sidecar structure. A project may combine small
files, but it must preserve these responsibilities:

```text
src/ugp/
  manifest.ts       # profiles, surfaces, and capability identifiers
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

## 3. Profile rule

A Profile defines domain vocabulary without modifying Core. Every frame type
defines:

- a subject type;
- named roles and allowed value kinds;
- required roles;
- a deterministic summary template;
- optional capability identifiers.

Add a Profile, role, vocabulary value, or capability adapter for new domain
meaning. Do not add a domain-specific top-level field to `GroundingCapsule`,
`SemanticFrame`, or `SemanticValue`.

Profiles should answer task-relevant competency questions. Depending on the
referent, these commonly include: what is it, what value or state does it have,
under which scope, based on what application object, and which next operations
are discoverable. A concept that does not apply is not required.

## 4. Binding rule

A Binding maps live application data to:

- stable `nodeId`;
- canonical entity subject;
- one Profile frame type;
- role values;
- optional data revision;
- capability identifiers.

The summary is rendered from the validated frame and Profile template. It is not
independently authored or stored as a second source of truth.

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
   roles, unknown roles, invalid kinds, and unknown vocabulary values.
2. A visible selection resolves to the exact node and canonical entity.
3. Capsule summary and frame change when authoritative application data or its
   revision changes.
4. Missing, stale, ambiguous, and mismatched descriptions fail closed.
5. Capsule output contains no geometry, selector evidence, credential, or raw
   API response duplication.
6. Unmount removes the node, anchor, and description provider.
7. Existing functional, accessibility, and visual acceptance remains green.

The delivery report lists linked referents, Profiles, capabilities, semantic
gaps, tests run, and any intentionally unsupported surface.
