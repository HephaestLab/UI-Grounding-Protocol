# UGP v0.2 semantic authoring candidate

Status: research draft. UGP v0.1 remains the accepted protocol baseline.

This draft adds a domain-neutral authoring and agent-consumption layer without
changing the v0.1 selection and referent-resolution records.

The normative first-principles constraints are in
[`FIRST_PRINCIPLES.md`](FIRST_PRINCIPLES.md). In particular, the grounded
referent—not a convenient page snapshot—is the unit of semantic description.

## Core grammar

The v0.2 agent-facing grammar contains four new concepts:

- `SemanticValue`: a small recursive set of scalar, quantity, entity, temporal,
  collection, and nested-frame values;
- `SemanticFrame`: a typed statement about one application-owned subject;
- `ProfileDefinition`: the schema and vocabulary for frame roles;
- `GroundingCapsule`: a compact Description compiled from a v0.1 grounding
  record and an application Binding.

The Capsule keeps the grounded node identity and optional node revision in its
domain-neutral `referent` member. `at` identifies the containing surface;
`description.frame.subject` identifies the canonical application subject. These
three identities are related but not interchangeable.

Domain concepts never become top-level Capsule fields. BI may define `metric`
and `query` roles; a document profile may define `effect` and `noticePeriod`;
workflow and commerce profiles define different roles using the same Core
grammar.

## Description authority

`description.frame` is normative. `description.summary` is a deterministic
human-readable projection of that frame and must not be maintained as a second
independent source of truth. Profiles select required roles through
`summaryPlan`; the canonical renderer emits `subject — Role: value` clauses and
does not permit templates to add factual literals.

Bindings must derive identity and role values from application-owned data.
Visible UI text may provide a label, but does not establish canonical identity,
authority, state meaning, or permission.

Every Profile frame declares `identity` and `meaning` competency questions.
Their required answer paths make semantic completeness machine-checkable and
must be represented in the deterministic summary. A structurally valid Frame
that cannot independently identify and explain its referent is invalid UGP.

Each Binding records fact-level provenance for node identity, subject, roles,
revision, and capabilities. The provenance cites sources in a frozen Authority
Manifest; it remains an authoring/audit artifact rather than bloating every
agent-facing Capsule.

## Expansion and execution boundary

The Capsule is self-describing for common interpretation tasks. Larger metric
definitions, full queries, document resources, data lineage, and API schemas are
retrieved on demand through registered capability identifiers.

Capability identifiers advertise compatible operations; they do not grant
permission. Hosts re-authorize and validate every invocation. Model loops,
credentials, tool execution, confirmation, and durable audit storage are outside
UGP Core.

## Minimality rule

The default Capsule contains the referent-sufficient structured statement needed
to identify and understand the selected referent, its surface revision, and
compatible next capabilities. Minimality is independent of the current task or
benchmark. Diagnostic selection geometry, transient action targets, and ranking
evidence remain outside the Description and are not duplicated into the Capsule.

A surface may expose a compact index of child referents, but a page-level Frame
cannot replace independently addressable component Capsules.
