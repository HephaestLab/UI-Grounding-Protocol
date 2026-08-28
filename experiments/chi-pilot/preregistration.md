# UGP CHI Pilot preregistration draft

Status: **design freeze candidate; no inferential runs started**  
Protocol baseline: UGP v0.1 candidate `0aebc56452ddade4d302e89b637d20620a9b041f`

## Claims and hypotheses

### RQ1 — Semantic preservation

H1a: UGP-conditioned coding runs are non-inferior to conventional runs on
functional acceptance and blinded visual quality.

H1b: UGP-conditioned coding runs have higher semantic-contract correctness than
generic-semantic runs.

### RQ2 — Semantic sufficiency and shared grounding

H2a: On a held-out application, UGP improves business-referent task success over
DOM/AX evidence.

H2b: With controlled business facts held equal, UGP reduces application-specific
adaptation and clarification relative to ad-hoc semantic JSON.

H2c: In tasks where a person refers to visible business objects, UGP reduces
wrong-object actions and human corrections relative to DOM/AX grounding while
preserving task time and usability.

## Experimental unit and blocking

One unit is an independent model–task–condition–replicate run. Task instance and
framework are blocks. Formal runs use randomized condition order and fresh
contexts. The primary model-independent contrasts are UGP versus conventional
for RQ1 and UGP versus ad-hoc semantics for RQ2.

The fast Pilot execution model is `gpt-5.6-luna` with reasoning effort `medium`.
Model-family generalization is assessed only after the Luna pipeline passes,
using the same frozen packets with Terra and Sol. Model is a block, not the
treatment of interest.

## Outcomes

### RQ1 primary outcomes

- functional hidden-test pass rate;
- blinded visual quality score;
- first-pass acceptance rate;
- UGP semantic round-trip correctness.

Functional and visual quality use predeclared non-inferiority margins. Semantic
correctness uses superiority contrasts.

### RQ2 primary outcomes

- exact business referent identification;
- safe-action decision accuracy;
- task-level success on the held-out application.

### RQ2 human–AI outcomes

- wrong-object rate;
- clarification and correction count;
- collaborative task completion time;
- successful recovery after an incorrect or ambiguous grounding;
- participant confidence that the assistant identified the intended object;
- post-task usability and perceived control.

The human outcomes belong to RQ2 rather than a third research question. They are
an independent evidentiary layer and are not inferred from agent-only benchmark
performance.

### Secondary observable cost outcomes

- wall-clock duration;
- observable tool calls;
- repair or clarification count;
- input and output UTF-8 bytes;
- final patch size for coding tasks.

Visible byte counts are representation and communication-cost proxies. They are
not reported as exact model token consumption.

## Fairness controls

- `adhoc` and `ugp` arms expose identical controlled business facts.
- The task goal, output schema, model, reasoning setting, tools, timeout, and
  initial artifact are constant within a block.
- Oracles and hidden tests are never copied into participant packets.
- Condition labels are replaced by opaque arm codes in participant manifests.
- Participant outputs from one run are never provided to another run.
- Formal scoring is deterministic and executed only after the model stops.

## Exclusion and rerun rules

- A failure before the model receives the packet is an infrastructure failure
  and may be rerun without counting as an observation.
- A failure after packet exposure is retained under intention-to-treat.
- A documented platform crash may be rerun once; both records are preserved.
- Runs are never excluded for poor quality, long duration, or an unexpected
  direction of effect.
- Data collection pauses if more than 10% of attempted runs fail for
  infrastructure reasons.

## Analysis

Pilot reporting emphasizes effect estimates and 95% confidence intervals, not
significance thresholds. Formal binary outcomes use logistic mixed-effects
models; counts use negative-binomial mixed-effects models; duration uses a
log-linear mixed-effects model or survival model if censored. Task and framework
are random effects. The two primary pairwise contrasts are predeclared and
corrected together.

## Pilot sizes

- Infrastructure calibration: one run per RQ2 arm; excluded from inference.
- Fast Pilot: 4 tasks × 2 framework/domain variants × 3 arms × 3 replicates = 72
  RQ2 runs, followed by a separately frozen RQ1 subset.
- Human–AI Pilot: separately powered within-participant design after ethics and
  recruitment review; its sample size is not inferred from model-run variance.
- Formal study size is chosen from Pilot variance and the smallest effect of
  practical interest; it is not selected from Pilot p-values.

## Gates before inferential collection

- 100% of task definitions and oracles pass deterministic validation.
- `adhoc` and `ugp` controlled fact sets match exactly for every task.
- 100% of prepared packets omit condition labels and oracle data.
- Re-scoring the same answer is byte-for-byte stable.
- At least 95% of calibration runs produce a complete run record.
- Task reset succeeds in at least 98% of 50 repeated resets.
- No calibration item has a ceiling or floor score across all arms.
- The model-design boundary is documented: experimental models did not create or
  revise the design, tasks, metrics, or oracle.

Changing a hypothesis, primary outcome, condition definition, oracle, or
exclusion rule after the first inferential run requires a new design version.
