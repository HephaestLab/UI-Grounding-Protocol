# UGP v0.2 semantic authoring candidate

Status: research draft. UGP v0.1 remains the accepted protocol baseline.

This draft adds a domain-neutral authoring and agent-consumption layer without
changing the v0.1 selection and referent-resolution records.

## Core grammar

The v0.2 agent-facing grammar contains four new concepts:

- `SemanticValue`: a small recursive set of scalar, quantity, entity, temporal,
  collection, and nested-frame values;
- `SemanticFrame`: a typed statement about one application-owned subject;
- `ProfileDefinition`: the schema and vocabulary for frame roles;
- `GroundingCapsule`: a compact Description compiled from a v0.1 grounding
  record and an application Binding.

Domain concepts never become top-level Capsule fields. BI may define `metric`
and `query` roles; a document profile may define `effect` and `noticePeriod`;
workflow and commerce profiles define different roles using the same Core
grammar.

## Description authority

`description.frame` is normative. `description.summary` is a deterministic
human-readable projection of that frame and must not be maintained as a second
independent source of truth.

Bindings must derive identity and role values from application-owned data.
Visible UI text may provide a label, but does not establish canonical identity,
authority, state meaning, or permission.

## Expansion and execution boundary

The Capsule is self-describing for common interpretation tasks. Larger metric
definitions, full queries, document resources, data lineage, and API schemas are
retrieved on demand through registered capability identifiers.

Capability identifiers advertise compatible operations; they do not grant
permission. Hosts re-authorize and validate every invocation. Model loops,
credentials, tool execution, confirmation, and durable audit storage are outside
UGP Core.

## Minimality rule

The default Capsule contains only the structured statement needed to understand
the selected referent, its surface revision, and compatible next capabilities.
Diagnostic selection geometry and evidence remain in the v0.1 GroundingBundle
and are not duplicated into the Capsule.
