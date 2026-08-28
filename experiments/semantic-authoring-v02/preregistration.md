# Preregistration candidate

This document is frozen only after infrastructure calibration passes all gates.
Until then it defines preparation decisions, not a registered study.

## Hypotheses

- **H1a:** UGP is non-inferior to conventional authoring on hidden functional
  pass rate and blinded visual quality, using margins frozen after calibration.
- **H1b:** UGP produces higher exact semantic round-trip accuracy than an
  equal-fact application-specific sidecar.
- **H1c:** Retrofit with UGP preserves baseline behavior and appearance while
  adding standardized semantics with limited view-layer change.
- **H2a:** An independent agent given a UGP Capsule more accurately recovers the
  business referent and frame than one given an equal-fact application-specific
  sidecar.
- **H2b:** UGP improves valid capability selection and bound-argument accuracy
  without increasing fabricated or unauthorized calls.
- **H2c:** The UGP advantage transfers to a held-out application and to a
  held-out domain through a new Profile, without changing Core fields.

## Units, allocation, and independence

An RQ1 unit is one fresh model context completing one task-condition pair. An
RQ2 unit is one fresh model context completing a balanced block of independent
interpretation cases under one condition. Replicates receive opaque arm codes,
fresh contexts, and randomized task ordering. Task, domain, workflow, model, and
replicate are retained as blocking variables.

The same output cannot appear in two cells. Repair prompts are recorded as
additional rounds rather than independent units. Calibration examples and any
task edited after seeing their outputs are excluded from inference.

## Conditions and controlled information

RQ1 conventional receives the product brief and application data. Generic also
receives an application-specific sidecar requirement. UGP instead receives the
frozen matching UGP Skill and draft SDK. Generic and UGP conditions expose the
same controlled business fact IDs. The generic representation must remain a
credible, compact baseline and may not be deliberately degraded.

RQ2 DOM/AX is diagnostic. The primary contrast uses ad-hoc and UGP inputs with
identical controlled facts. Input bytes and documentation bytes are reported so
standardization gains are not confused with extra information.

## RQ1 outcomes

Primary product outcomes:

- hidden functional-test pass rate;
- blinded visual-quality score and retrofit screenshot difference;
- first-pass task acceptance.

Primary semantic outcomes:

- exact target-to-canonical-entity recovery;
- frame/profile validation and controlled-fact coverage;
- live data/revision-to-Capsule consistency;
- missing, stale, ambiguous, and invalid cases failing closed;
- valid capability identifiers with no credential or authority leakage.

Secondary cost outcomes are wall time, observable tool calls, input/output
bytes, repair rounds, total patch size, and view-layer patch size. Exact hidden
reasoning tokens are not observable and will not be estimated.

## RQ2 outcomes

Primary outcomes are exact referent recovery, frame comprehension, capability
choice, and valid bound arguments. Safety outcomes are fabricated capability,
unauthorized-call, and stale-state continuation rates. Adaptation outcomes are
condition documentation bytes and application-specific adapter code.

## Analysis

Binary outcomes use mixed-effects logistic models with condition as fixed effect
and task/application plus model as blocking effects when estimable. Continuous
cost and visual outcomes use robust or ordinal mixed models matching their
distributions. Report effect sizes and 95% intervals; correct each RQ's primary
family with Holm's method. Non-inferiority margins and sample size are frozen
from task-independent infrastructure calibration and a precision target, not
from formal condition effects.

Results are reported per model and pooled only when interaction diagnostics do
not contradict pooling. Failed infrastructure, policy refusal, and task failure
remain distinct outcomes. No model-only measure is interpreted as human
preference, trust, workload, or shared-grounding evidence.

## Exclusions

Exclude only corrupted packets, unavailable required tools before work begins,
or verified infrastructure failure. Do not exclude wrong answers, hallucinated
facts, policy refusals, timeouts, or build failures. Any post-freeze task change
invalidates all affected cells.

## Formal-run gates

1. Draft schemas and generated types are byte-stable.
2. All four domain Profiles pass positive and negative conformance without Core
   schema changes.
3. Both Skills pass structure validation and independent forward tests on unseen
   calibration starters.
4. Eight task packets validate; generic and UGP controlled fact sets match.
5. Hidden files are absent from participant packets.
6. Four retrofit baselines pass their own functional and visual checks before
   any semantic edit.
7. Fifty prepare/reset cycles produce identical participant bytes aside from
   declared run metadata.
8. Scoring the same frozen artifact twice is byte-identical.
9. Calibration shows no universal ceiling/floor and freezes margins, sample
   size, participant models, reasoning settings, and time limits.
10. A commit hash, dependency lock hash, Skills hash, task-bank hash, and
    protocol-schema hash are written to `readiness.json`.

The design status remains `pre-experiment` until every gate passes. Changing it
to `frozen` is a deliberate later action, never performed by the preparation
scripts.
