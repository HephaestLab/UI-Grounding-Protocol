---
name: ugp-build
description:
  Build a new frontend with UGP sidecar semantics, typed component links, and
  verified selection-to-Capsule round trips. Use for greenfield UI
  implementation that must preserve application-owned business meaning.
---

# UGP greenfield authoring

Build the requested product and its semantic sidecar as one system. UGP is an
interoperability layer, not the product UI or an agent runtime.

Before editing, read
[references/authoring-contract.md](references/authoring-contract.md).

## Workflow

1. Inspect requirements, data contracts, domain models, routes, and existing
   conventions. Identify the visible referents users or agents may point to.
2. Write competency questions for those referents. Determine which application
   facts answer identity, current value/state, scope/basis, and compatible next
   operations when applicable.
3. Trace every semantic fact to an authoritative source. Record unresolved facts
   as gaps; do not infer business meaning from labels alone.
4. Create `src/ugp/` with Profiles, typed Bindings, capability identifiers,
   surfaces, and round-trip tests. Reuse a Profile for repeated frame shapes.
5. Build the view. Link a component to its Binding with the smallest
   lifecycle-safe hook or registration. Keep Profile prose, mappings, API
   details, authorization, and execution outside view components.
6. Verify normal product acceptance and the semantic round trip. Exercise
   missing, ambiguous, stale, invalid, and unmount paths.

## Invariants

- Extend domain meaning through Profiles and roles, never new Core Capsule
  fields.
- Derive the summary deterministically from the validated frame.
- Treat capability identifiers as discovery only; the host re-authorizes and
  executes.
- Keep selection and Capsule generation usable without a chat UI, model, or API
  key.
- Do not trade visual, accessibility, or functional quality for semantic
  coverage.

Finish with a short report of Profiles, linked referents, capabilities, semantic
gaps, unsupported surfaces, and verification results.
