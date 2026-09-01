---
name: ugp-retrofit
description:
  Add independently complete UGP referent descriptions and fact-level source
  provenance to an existing frontend through a sidecar and minimal lifecycle
  links while preserving behavior and visual output. Use for established UI
  codebases that need application-owned semantics without product refactoring.
---

# UGP minimum-change retrofit

Preserve the existing product while adding a verifiable semantic sidecar. Do not
use the retrofit to justify unrelated component, state, styling, or API
refactoring.

Before editing, read
[references/authoring-contract.md](references/authoring-contract.md).

## Workflow

1. Record functional, accessibility, visual, build, and test baselines. Preserve
   existing user changes.
2. Inspect without editing. Inventory meaning-bearing visible referents, their
   component and dynamic lifecycle, canonical identity, live state, and
   authoritative backend/domain/API/documentation sources.
3. Freeze an Authority Manifest and a semantic-gap report. In evaluation work,
   exclude task text, selected task IDs, gold, scorers, and outcomes from
   authoring sources.
4. Define Profiles with mandatory `identity` and `meaning` competency questions
   plus referent-specific state, scope, relation, effect, constraint, or
   completion questions. Reject a shape-valid but semantically hollow Frame.
5. Add sidecar Bindings with per-fact source citations, then add the smallest
   lifecycle-safe component links. Keep transient UI targets and exact action
   arguments separate from the business Description.
6. Model compound controls by application transitions: distinguish proposed
   input, executable candidates, committed values, cancellation, transaction
   lifetime, and postcondition evidence. Do not encode one observed widget's DOM
   shape as a universal rule.
7. Verify every linked referent independently produces its own Capsule. Use a
   compact surface index for discovery; never substitute one page aggregate for
   component Descriptions.
8. Run semantic and provenance audits, exercise dynamic mount/update/unmount and
   fail-closed paths, compare against the frozen product baseline, and freeze a
   new adapter version before actor evaluation.

## Stop conditions

Pause rather than guess when canonical identity, required business meaning, or
fact provenance cannot be established. Request direction before changing a
public component API, shared state architecture, authorization flow, or product
behavior solely to install UGP.

## Invariants

- `description.frame` is normative; the summary is its deterministic projection
  and includes required identity and meaning answers.
- Every emitted semantic fact cites a declared authoritative source. DOM/AX can
  anchor or label but cannot be its sole business authority.
- Every meaning-bearing component is independently addressable; surface
  aggregation is discovery, not description substitution.
- Capability discovery grants no authority and contains no transient target.
- Proposed input, committed state, and postcondition evidence remain distinct;
  unresolved transitions follow the application transaction, not temporary
  visibility.
- Runtime evaluation Capsules come from the installed sidecar and live Binding
  registry, never a harness-side DOM-to-Capsule transformer.
- A successful retrofit has no unexplained functional, visual, accessibility, or
  API regression.

Finish with changed view lines, sidecar artifacts, competency and provenance
coverage, unsupported referents, baseline comparison, and verification results.
