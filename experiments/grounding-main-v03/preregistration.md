# Preregistration: UGP grounding main study v0.3

Status: frozen for infrastructure preflight on 2026-08-28. No confirmatory
outcome may be inspected before all publication gates in `readiness.json` pass.
Pilot results are labeled and stored under a distinct run ID.

## Hypotheses

- **H1 (referent):** UGP increases strict success on ScreenPR Referent and the
  three pointed QA diagnostics relative to every registered grounding method.
- **H2 (transfer):** UGP increases strict task success on WorkArena++ and
  WebMall Action under the same actor and action space.
- **H3 (safety):** UGP increases ST-WebAgentBench CuP and does not increase risk
  ratio relative to Vision Only and HTML/AX.
- **H4 (specificity / negative control):** On ScreenQA Visible items that
  require no pointed referent or external business semantics, UGP's benefit is
  absent or materially smaller than on the referent strata.
- **H5 (model interaction):** Grounding effects may differ by actor model; the
  method-by-model interaction is estimated rather than averaged away.

## Experimental unit and assignment

The experimental unit is a benchmark task under one method-model condition.
Every sampled task is paired across all conditions supported by that stratum.
Task order is shuffled with seed `240828`; opaque episode IDs prevent semantic
task IDs from reaching the actor. Infrastructure failures are rerun under the
same condition. Invalid actor output and exceeded budgets are failures.

The primary study has one run per task-condition pair. Three fresh-context runs
are collected on a deterministic 20% robustness subset. This avoids pretending
that an unavailable provider seed is controllable while still measuring actor
variance.

## Sample plan

The exact registered counts live in `design.json`: 650 ScreenPR, 800 ScreenQA,
240 DashboardQA-Ref, 160 WorkArena-QA-Ref, 91 WebMall-QA-Ref, 128 WorkArena++,
91 WebMall Action, and 120 ST-WebAgentBench. Across eight methods and two actor
models this is 36,480 primary episodes plus 14,592 additional robustness
episodes.

These counts are frozen planning targets, not a claim that all source datasets
contain protocol-derived annotations today. Derived referent strata must pass an
independent annotation agreement audit before confirmatory execution. They
become final confirmatory counts only after calibration supplies the baseline
success/discordance parameters and the power procedure in
`analysis/POWER_ANALYSIS.md` passes; any adjustment is versioned before main
outcomes are collected.

## Outcomes

The common primary outcome is deterministic strict success per instance.
Benchmark-native metrics are secondary. The table cell is success percentage;
the macro average is the unweighted mean of the eight pre-registered stratum
rates. Confidence intervals use a 10,000-resample task-cluster bootstrap.

The primary inferential model is a binomial mixed-effects regression:

```text
strictSuccess ~ groundingMethod * model * taskFamily
              + (1 | task) + (1 | domain)
```

This primary model uses replicate 1 only. The registered 20% three-run subset is
analyzed separately with `(1 | replicate)` as a robustness model; those extra
runs are not pooled into the primary estimate.

Registered UGP-versus-baseline contrasts are corrected with Holm's method within
each hypothesis family. We report odds ratios, average marginal effects, 95%
confidence intervals, adjusted p-values, raw counts, and missingness.

## Baseline fidelity

The main table is a fixed-actor representation study. Published methods altered
to satisfy that constraint are explicitly labeled adaptations. We separately
report native system/checkpoint results where runnable. A missing native result
is `N/A`, never zero and never silently replaced by our implementation.

All methods receive the same task wording, action set, step budget, and source
fact inventory. Read-only MCP is used in the main table; tool-capable MCP is a
secondary systems experiment. Equal-fact flat prose is an ablation, not a named
published baseline.

## Leakage and audit

Actor packets exclude source IDs, gold outcomes, scorer rules, and other
conditions. Scorers are deterministic and invoked only after a trajectory is
sealed. A publication run requires a process-level actor sandbox with no
filesystem, shell, benchmark, network, or evaluator tools except the declared
environment action channel.

Codex subagent runs use fresh no-history tasks and can be useful pilots, but the
current interface does not prove tool isolation, expose exact token accounting,
or carry a screenshot as native multimodal input to a tool-disabled subagent.
They cannot satisfy the confirmatory no-cheating or visual-input gates by prompt
instruction alone.

## Exclusions and deviations

Only independently logged infrastructure failures may be excluded. All
deviations are dated, justified, and reported separately from the frozen primary
analysis. A ceiling/floor calibration failure changes task sampling before
confirmatory outcomes; it does not authorize post-hoc removal.
