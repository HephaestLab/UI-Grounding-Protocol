---
name: ugp-build
description:
  Build a new frontend with independently complete UGP referent descriptions,
  fact-level source provenance, typed lifecycle links, and verified semantic
  round trips. Use for greenfield UI implementation that must preserve
  application-owned business meaning.
---

# UGP greenfield authoring

Build the product UI and semantic sidecar as one system. UGP is an
interoperability layer, not the product UI, an agent runtime, or a page-wide
accessibility dump.

Before editing, read
[references/authoring-contract.md](references/authoring-contract.md).

## Workflow

1. Inspect product requirements, domain models, state machines, APIs, routes,
   and documentation. Inventory the meaning-bearing referents a user or agent
   can point to; the referent, not the page, is the semantic unit.
2. Freeze an Authority Manifest. Give each source a stable ID, locator, and
   revision. Record gaps rather than filling them from labels or task wording.
3. Define Profiles before component links. Every frame declares `identity` and
   `meaning` competency questions plus applicable state, scope, relation,
   effect, constraint, or completion questions. Mark the answers that the
   deterministic summary must include.
4. Implement typed Bindings. Cite Authority Manifest source IDs for node
   identity, subject, every role, revision, and capability. Keep transient UI
   targets and exact action arguments outside the business Description.
5. Build the view and add the smallest lifecycle-safe link. Keep Profiles,
   summary plans, mappings, APIs, authorization, and execution out of view
   components.
6. Make each linked referent independently resolvable to its own Capsule. A
   surface may expose a compact child index, but it must not replace child
   Descriptions with one aggregate page Frame.
7. Run schema, competency, provenance, round-trip, lifecycle, failure, and
   product acceptance tests before any actor evaluation.

## Invariants

- Extend domain meaning through Profiles and roles, never domain-specific Core
  fields.
- `description.frame` is normative; the summary is its deterministic projection
  and includes the Profile's required identity and meaning answers.
- DOM/AX may anchor or label a referent but cannot author business meaning.
- Capability discovery grants no authority and contains no transient target.
- Proposed input, committed state, and postcondition evidence remain distinct.
- Missing meaning or source provenance fails closed.
- Do not trade visual, accessibility, or functional quality for semantic
  coverage.

Finish with linked referents, Profiles and competency coverage, Authority
Manifest and unresolved gaps, capabilities, component-level Capsule evidence,
and verification results.
