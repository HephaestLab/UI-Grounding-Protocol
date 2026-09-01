# SuiteCRM semantic realignment and staged evaluation

Status: v8 passed offline and live-runtime gates; a bounded diagnostic pilot is
active.

## Why the development loop changed

The frozen v2–v7 line improved action targeting, choice arguments, localization,
relationship state, commit gating, and transaction lifetime. Its central Capsule
nevertheless describes a whole CRM module and nests UI controls inside that
Frame. It therefore measures a useful semantic execution adapter but does not
fully instantiate UGP's original referent-to-application-meaning claim.

Two hundred episodes are appropriate for a frozen confirmatory candidate, not
for discovering whether the protocol's semantic unit and authoring contract are
correct. No further large run starts until the offline gates below pass.

## Offline gates

1. **Referent inventory:** every meaning-bearing business object, property,
   action, status/message, and composite region is classified independently of
   benchmark tasks.
2. **Competency:** every Profile frame answers mandatory `identity` and
   `meaning` questions plus applicable state, relation, effect, constraint, and
   completion questions.
3. **Authority:** node, subject, roles, revision, and capabilities have
   fact-level citations resolving to a frozen Authority Manifest.
4. **Separation:** business Frames contain no transient target IDs or raw action
   mechanics; visible links and host interaction Bindings remain separate.
5. **Granularity:** every indexed component can produce its own Capsule; surface
   discovery is a compact index rather than an aggregate substitute.
6. **Determinism:** summary equals Profile rendering of the validated Frame and
   includes required identity and meaning answers.
7. **Lifecycle:** dynamic referents and proposed-to-committed transitions pass
   mount/update/unmount, cancellation, postcondition, and fail-closed tests.
8. **Regression:** product functionality, accessibility, visuals, APIs, and
   benchmark reset remain unchanged.

## Evaluation funnel

| Stage | Purpose                                                            | Planned actor episodes | Promotion rule                                                 |
| ----- | ------------------------------------------------------------------ | ---------------------: | -------------------------------------------------------------- |
| L0    | Static schemas, competency, provenance, size, and round-trip audit |                      0 | All offline gates pass                                         |
| L1    | Infrastructure smoke on 4–6 tasks                                  |                    4–6 | No adapter/runtime failure                                     |
| L2    | Fast paired development: 12 tasks × UGP/HTML-AX, one fixed model   |                     24 | Qualitative failure audit plus no broad regression             |
| L3    | Held-out paired check: 20 unseen tasks × two methods               |                     40 | Improvement transfers without task-specific changes            |
| L4    | Confirmatory multi-model run                                       |                    200 | Protocol, adapter, tasks, prompts, scoring, and digests frozen |

L2 is diagnostic and cannot support publication-grade effect claims. Its twelve
task pairs are fixed before outcomes and span navigation, read, edit, enum,
compound choice, hidden/reachable field, commit, and postcondition behavior.
Only one task-agnostic abstraction changes per adapter version. L3 tasks remain
unseen during L2 authoring. L4 begins only after the smaller stages stop finding
protocol or adapter defects.

The current v8 pilot deliberately expands L2 to 20 previously exercised tasks
paired across UGP and HTML/AX: 40 episodes with one fixed model. It is a rapid
development diagnostic, not L3 held-out evidence and not a publication-grade
effect estimate. Its purpose is to expose protocol, Profile, Binding, Skill,
actor, benchmark, and environment failure modes before any larger rerun.

## Version boundary

Frozen v2–v7 runs and digests are never rewritten or pooled with the realigned
adapter. The next implementation receives a new adapter ID and digest only after
L0 passes. Baseline and UGP episodes remain paired within each new run version.
