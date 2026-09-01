# UGP authoring contract

## Responsibility layout

Preserve these responsibilities even when small projects combine files:

```text
src/ugp/
  authority.json
  manifest.ts
  profiles/
  bindings/
  capabilities/
  surfaces/
  tests/
```

## Semantic unit

The grounded referent is the unit of Description. Every meaning-bearing linked
component must resolve to its own stable node, canonical subject, validated
Frame, deterministic summary, revision, and compatible capability identifiers.

A surface may provide a compact index of child node IDs, labels, summaries, and
Capsule handles. It must not inline all UI controls into one page Frame and use
that aggregate as the Description of a child referent.

## Authority and provenance

Use sources in this order: domain model, glossary, semantic layer, or state
machine; backend code and documented API schema/behavior; validated live state
and typed props; rendered DOM/AX/text.

Freeze an Authority Manifest whose entries have a source ID, kind, stable
locator, and revision or digest. Each Binding cites source IDs for:

- node identity;
- canonical subject;
- every emitted role;
- revision, when emitted;
- every capability identifier.

Rendered text may provide a display label. It cannot by itself establish
business identity, meaning, state semantics, permission, or capability. Omit and
report facts that lack authority. For evaluations, authority sources exclude
task text, selected task IDs, gold, private scorers, and model outcomes.

## Profile and Description

A Profile defines frame types, role descriptions and value kinds, required
roles, vocabulary, competency questions, canonical summary role plans, and
compatible capabilities.

Every frame declares:

- an `identity` competency question answered by the subject;
- a `meaning` competency question answered by one or more required semantic
  roles;
- additional referent-specific questions when state, value, scope, relation,
  basis, precondition, effect, constraint, or completion evidence applies.

Answers marked `includeInSummary` must appear in `summaryPlan.roles` (the
subject is always included). The runtime validates the Frame first and renders
the canonical `subject — Role: value` projection. A plan only selects required
roles and cannot add labels or arbitrary factual literals. A nonblank,
schema-valid summary does not compensate for an unanswered competency question.

## Binding and component link

A typed Binding maps live application data to node identity, subject, Profile
frame, roles, revision, capabilities, and fact-level provenance. Static semantic
JSON copied into a component is not a Binding.

A React component normally keeps only:

```tsx
const ugp = useUgpLink(orderBinding, order);
return <button ref={ugp.ref}>Order {order.id}</button>;
```

Other frameworks register and dispose the node, Description provider, and
visible anchor together. Dynamic surfaces must follow their real
mount/update/unmount lifecycle.

## Interaction boundary

Keep three concerns distinct:

1. the semantic Frame describes application meaning and live business state;
2. the visible link maps the stable node to current UI anchors;
3. the host interaction Binding maps a capability to transient targets, exact
   arguments, authorization, execution, and postcondition checks.

A transient target ID is not a business role. If the UI control itself is the
referent, describe its application effect, target object, preconditions,
constraints, and completion evidence rather than only its DOM role or click
operation.

For compound or asynchronous controls, distinguish proposed input, candidates,
committed value, explicit cancellation, and completion evidence. Pending state
follows the application transaction across temporary visibility changes and is
released only by authoritative completion, cancellation, or transaction exit.

## Capability boundary

Capsules list stable capability identifiers, not credentials, permission claims,
action targets, or executable secrets. The host resolves the current
adapter/schema, validates arguments, re-authorizes, confirms when required,
executes, verifies, and audits. UGP must remain useful without an executor.

## Acceptance

- Profiles reject missing identity/meaning questions, unknown answer paths,
  non-required answer roles, blank required answers, and summaries that omit
  required answers.
- Binding materialization rejects missing or extra fact-level provenance.
- Every provenance citation resolves to the frozen Authority Manifest.
- Visible selection resolves to the exact linked node and canonical subject.
- Every meaning-bearing component has an independent Capsule; a surface
  aggregate is not counted as component coverage.
- Summary, Frame, and revision follow authoritative live data.
- Semantic Frames contain no geometry, selector evidence, transient target IDs,
  credentials, or raw API-response duplication.
- Missing, stale, ambiguous, mismatched, or semantically incomplete Descriptions
  fail closed.
- Dynamic lifecycle and proposed-to-committed transitions are verified.
- Functional, visual, accessibility, and API baselines remain green.
- Actor evaluation stays blocked until schema, competency, provenance,
  round-trip, and lifecycle gates pass.
