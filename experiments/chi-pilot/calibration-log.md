# Calibration log

Calibration observations diagnose the runner and task wording. They are never
included in hypothesis tests.

## CAL-001 — ambiguous referent answer contract

- Model: `gpt-5.6-luna`
- Reasoning: `medium`
- Context: fresh, no inherited turns
- Task: `reader-bi-ambiguous-record`
- Arm: UGP
- Initial result: schema valid; 5/6 fields matched; normalized score 0.8333
- Disagreement: the answer set `primaryEntity` to `null`, while identifying both
  candidates and selecting `clarify`.

Adjudication: the original wording combined “most specific plausible entity”
with an equally ranked ambiguity. Requiring a primary entity in that state
conflicted with the safe-action rule. Before any inferential run, the task rule
and oracle were changed so `primaryEntity` must be `null` whenever equally
supported referents require clarification. The candidate set remains the
referent-identification outcome. This revision applies to every condition.

The run remains infrastructure calibration and is not eligible for analysis.

## CAL-002 — three-arm pipeline calibration

After CAL-001 adjudication, one fresh Luna run was completed for each arm of the
same BI task. All answers conformed to the schema.

| Arm                  | Exact fields | Normalized score | Observable wall-clock |
| -------------------- | -----------: | ---------------: | --------------------: |
| DOM/AX               |          1/6 |           0.1667 |              38.125 s |
| ad-hoc semantic JSON |          6/6 |           1.0000 |              44.963 s |
| UGP                  |          6/6 |           1.0000 |              88.811 s |

The sample is deliberately non-inferential and wall-clock values are not
comparable under shared local scheduling. It confirms two design properties:

1. visible DOM/AX evidence does not expose the application-owned ambiguity;
2. equal-fact ad-hoc semantics and UGP both support the correct answer in a
   single known application.

The second result is expected. The primary RQ2 claim therefore cannot be based
on single-application accuracy. The next task set must measure transfer to a
held-out application and application-specific adaptation cost.

## CAL-003 — metadata leakage invalidated early calibration scores

The first runner version embedded semantic task names in run directories, and
the orchestration labels also included task and condition names. For example, an
execution model could see labels equivalent to `workflow-stale` or `dom` without
opening the assigned artifact. A DOM-only workflow run then returned the
complete stale-state oracle despite receiving no stale-state evidence.

Decision: every score produced before this correction is invalid, remains
calibration-only, and cannot be used even descriptively as model performance.
The runner now emits opaque `run-r<replicate>-<random>` identifiers. All future
experimental subtask names must also be opaque and must not encode task, domain,
condition, expected outcome, or replicate result.

This change affects only blinding metadata. It does not change conditions,
business facts, output schema, or scoring rules.

## CAL-004 — opaque three-domain calibration matrix

The three domains were rerun with opaque run IDs and opaque orchestration names.
Every run used a fresh `gpt-5.6-luna` context with reasoning `medium`.

| Domain                | DOM/AX | ad-hoc |    UGP |
| --------------------- | -----: | -----: | -----: |
| BI ambiguous record   | 0.1667 | 1.0000 | 1.0000 |
| document clause       | 0.3333 | 1.0000 | 1.0000 |
| workflow stale state  | 0.5000 | 1.0000 | 1.0000 |
| mean normalized score | 0.3333 | 1.0000 | 1.0000 |

This matrix verifies that the tasks distinguish visible structure from
application-owned semantics. It does not distinguish UGP from the equal-fact
ad-hoc baseline and cannot support a standardization claim.

The cost calibration also rejects a naive “UGP is always smaller” claim. UGP had
the largest total input in every independent run. Its shared adaptation guide is
591 bytes, while the three application-specific ad-hoc guides total 1,135 unique
bytes. Because the current calibration uses fresh runs, the UGP guide was
transmitted three times (1,773 bytes). A valid semantic-efficiency test must
therefore use a multi-application session that loads the shared UGP contract
once and compares its amortized cost with per-application ad-hoc adaptation.

Exact hidden token counts and tool-call counts remain unavailable. Input/output
UTF-8 bytes and wall-clock time are recorded only as observable proxies.
