# Clean-machine experiment handoff

This is the authoritative starting point for continuing the UGP v0.3 experiment
on another computer or in another Codex task.

## Scope frozen on this branch

- Branch: `experiment/grounding-main-v03`
- Main table: eight grounding methods × two actor models × five official
  benchmark strata = 16 rows and 80 cells.
- Main-table benchmarks: ScreenPR, ScreenQA, WorkArena++, WebMall Action, and
  ST-WebAgentBench.
- The proposed DashboardQA-Ref, WorkArena-QA-Ref, and WebMall-QA-Ref derived
  sets were removed before outcome collection. They are not prerequisites.
- Primary outcomes must not be collected until every publication gate in
  `readiness.json` passes.

## First run on a clean computer

Prefer Linux or WSL2 with Docker because the interactive benchmarks depend on
self-hosted web services.

```bash
git clone https://github.com/HephaestLab/UI-Grounding-Protocol.git
cd UI-Grounding-Protocol
git switch experiment/grounding-main-v03

# Node.js >=22.13 and pnpm 11.19 are required.
pnpm install --frozen-lockfile

# Materialize public upstream repositories at the exact registered commits.
pnpm experiment:v03:vendor:sync

# Validate design, machine prerequisites, source pins, leakage checks,
# deterministic fixture scoring, and live readiness gates.
pnpm experiment:v03:preflight
```

The preflight command must complete successfully even when it reports closed
gates. Its final JSON and `readiness.json` are the source of truth. Do not infer
readiness from prose or manually change a false gate to true.

For a quick repository-wide check, also run:

```bash
pnpm check
```

## What the next Codex should do

Continue preparation in this order, committing auditable evidence after each
step:

1. Re-run the clean-machine commands and report the exact failing readiness
   gates; do not collect primary outcomes.
2. Materialize ScreenPR and ScreenQA data and implement their source adapters,
   including deterministic task selection, image transport, and official-score
   projection. Pass one non-primary smoke task for each.
3. Provision the interactive benchmark runtimes: approved WorkArena instances,
   WebMall Docker services, and the ST-WebAgentBench WebArena/SuiteCRM services.
   Pass one official native smoke task per source.
4. Complete the eight-method representation adapters from a common frozen fact
   inventory. Audit cross-method fact parity; never give UGP extra source facts.
5. Provide an actor runner with native text/image input, fresh context, disabled
   filesystem/shell/evaluator access, hidden gold/scorers, and a recorded runner
   identity. Exact token usage remains `null` if the runner does not expose it.
6. Run only the calibration slice, check ceiling/floor behavior, run the
   registered power procedure, and version any sample-plan revision before
   opening main outcomes.
7. Run the 80-cell primary matrix only after all publication gates pass. Keep
   pilots and confirmatory runs under distinct run IDs.

Codex subagents without a separate API key are acceptable for text-only
engineering pilots. They are not sufficient for confirmatory Vision Only or
ScreenQA evidence because the current handoff does not enforce filesystem/tool
isolation or native screenshot delivery. Do not weaken this rule to make a gate
appear green.

## Evidence required to close gates

| Gate area            | Minimum evidence                                                             |
| -------------------- | ---------------------------------------------------------------------------- |
| Source integration   | Frozen source task IDs, adapter version, and a passing native smoke trace    |
| License/access       | Recorded terms review and required access approval; never commit credentials |
| Fact parity          | Machine-readable per-task fact-key comparison across all eight methods       |
| Hidden scoring       | Actor-readable packet audit plus scorer/gold isolation trace                 |
| Actor isolation      | Runner configuration proving tools/filesystem/evaluator access are disabled  |
| Multimodal transport | Captured request metadata proving screenshots are native model inputs        |
| Calibration/power    | Sealed calibration IDs, parameters, simulation code, and power curves        |

## Existing contracts and commands

- `design.json`: frozen factors, sample counts, hypotheses, and analysis model.
- `benchmark-manifest.json`: official sources, exact commits, access, and terms.
- `benchmark-adapters.json`: per-benchmark integration status and remaining
  work.
- `shared/ACTOR_PROTOCOL.md`: model request/response and minimal-loop rules.
- `shared/BENCHMARK_ADAPTER_PROTOCOL.md`: source adapter boundary.
- `shared/CODEX_SUBAGENT_RUNBOOK.md`: permitted pilot-only Codex execution.
- `RESULT_TABLE_TEMPLATE.md`: exact publication-table shape.
- `pnpm experiment:v03:validate`: static design and contract validation.
- `pnpm experiment:v03:doctor`: local dependency/access diagnostics.
- `pnpm experiment:v03:preflight`: authoritative readiness report.

Generated runs belong under ignored `.runs/`. Gold and scorers must never be
placed in an actor-readable location during publication runs. Never commit
credentials, gated datasets, benchmark services, or generated outcome files.

## Copy-paste task for another Codex

```text
Continue the UGP experiment from branch experiment/grounding-main-v03. Read
experiments/grounding-main-v03/HANDOFF.md, README.md, design.json,
readiness.json, benchmark-manifest.json, benchmark-adapters.json, and both
shared actor/adapter protocols before changing anything. Run the clean-machine
preflight, report its exact false gates, and then work through the handoff order.
Do not collect or inspect confirmatory outcomes until every publication gate
passes. Do not invent benchmark data, silently substitute a baseline, expose
gold/scorers to an actor, estimate missing token usage, or call a pilot result
publication-grade. Commit each independently verified preparation milestone.
```
