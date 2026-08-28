---
name: ugp-retrofit
description:
  Add UGP semantics to an existing frontend through a sidecar and the smallest
  lifecycle-safe component links while preserving its behavior and visual
  output. Use for minimum-change upgrades of established UI codebases.
---

# UGP minimum-change retrofit

Preserve the existing product while adding a verifiable semantic sidecar. Do not
use the retrofit as an excuse for component, state-management, styling, or API
refactoring.

Before editing, read
[references/authoring-contract.md](references/authoring-contract.md).

## Workflow

1. Record the current functional, accessibility, visual, build, and test
   baselines. Identify existing user changes and keep them intact.
2. Inspect without editing. Map target visible referents to their component,
   live props/state, API/domain source, lifecycle, and stable identity.
3. Write competency questions and a semantic-gap list. Do not use DOM labels to
   fill facts that the application cannot authoritatively establish.
4. Add `src/ugp/` Profiles, typed Bindings, capability identifiers, surfaces,
   and tests. Keep them independent of view structure.
5. Add the minimum component link: normally one Binding import, one link hook,
   and one existing element ref. Preserve DOM shape, public props, layout,
   styling, keyboard behavior, state flow, and API behavior.
6. Compare against the frozen baseline. Revert or narrow unrelated diffs and
   verify selection-to-Capsule behavior plus failure and cleanup paths.

## Stop conditions

Pause and report rather than guess when canonical identity or required business
meaning cannot be traced. Request direction before changing a public component
API, shared state architecture, authorization flow, or product behavior solely
to make UGP easier to install.

## Invariants

- Extend Profiles, never Core fields, for domain meaning.
- Summary is a deterministic projection of the frame.
- Capability discovery grants no authority and triggers no execution.
- The optional Inspector is a consumer, not an application dependency.
- A successful retrofit has no unexplained functional, visual, accessibility, or
  API regression.

Finish with changed view lines/files, sidecar artifacts, semantic coverage and
gaps, baseline comparison, and verification results.
