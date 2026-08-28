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

## Project-owner actions (你需要完成)

The next Codex can implement and audit the harness, but it cannot perform the
following owner-only actions. Complete them on the experiment computer; never
paste tokens, passwords, signing keys, or gated data into a chat or commit.

- [ ] **Prepare the machine.** Use Linux or WSL2, install Docker with Compose,
      and confirm that containers and Playwright browsers can run. The full
      interactive suite needs more capacity than the repository-only checks.
- [ ] **Authenticate Codex without an API key.** Install the current Codex CLI,
      run `codex login`, and choose ChatGPT OAuth. The registered default is the
      no-API-key Codex CLI route. Run `codex debug models` and record whether
      `gpt-5.6-luna` and `gpt-5.4` are actually available; do not silently
      substitute a model.
- [ ] **Request WorkArena access.** Open
      `https://huggingface.co/datasets/ServiceNow/WorkArena-Instances`, accept
      the terms, submit the access form, wait for approval, and authenticate the
      experiment computer with Hugging Face. Set `UGP_WORKARENA_ACCESS=approved`
      only after a real instance reset and smoke task succeed.
- [ ] **Resolve WebMall and WebMall-Interfaces terms.** Obtain an explicit
      license or written research-use permission from the authors and record the
      decision in `LICENSE_ACCESS_AUDIT.md`. If permission cannot be obtained,
      instruct Codex to propose a pre-outcome design revision that removes or
      replaces the affected benchmark/methods; public source availability alone
      is not approval.
- [ ] **Choose ST-WebAgentBench hosting.** Provide an authorized AWS account for
      the recommended WebArena AMI, or approve a fully local GitLab and
      ShoppingAdmin deployment. SuiteCRM can be self-hosted with the pinned
      Docker setup. A leaderboard signing key is optional until an official
      submission is requested.
- [ ] **Accept the actor claim boundary.** With no API key, the backbone must be
      reported as an isolated **Codex CLI actor using the selected model**, not
      as a raw Responses API model. If a raw-model claim becomes mandatory, a
      separate API/service-account runner and secret must be supplied through a
      local secret manager, never through the repository or chat.

Everything else in this handoff—including service installation, adapter code,
isolation tests, fact-parity checks, calibration, power analysis, and result
generation—can be performed by the next Codex after the corresponding owner
action is complete.

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
5. Implement the no-API-key actor runner with `codex exec`. For every step, make
   a new `--ephemeral` invocation, select the registered `--model`, attach the
   screenshot with `--image`, require the actor response schema with
   `--output-schema`, and retain `--json` events as the runner transcript. Run
   it from a clean non-repository directory with `--ignore-user-config` and an
   outer container/VM boundary.
6. Run only the calibration slice, check ceiling/floor behavior, run the
   registered power procedure, and version any sample-plan revision before
   opening main outcomes.
7. Run the 80-cell primary matrix only after all publication gates pass. Keep
   pilots and confirmatory runs under distinct run IDs.

The actor container receives only the current public request, current screenshot
when applicable, and actor-response schema. It must not mount the repository,
source task IDs, prior conditions, gold, scorers, benchmark credentials, or
result summaries. The host process owns the browser action channel and invokes
the scorer only after sealing the trajectory. Restrict local command access and
network egress, record the effective permission profile, and treat any attempted
undeclared tool call or invalid JSON as failure. Exact token usage remains
`null` if the JSONL runner transcript does not expose it.

Ordinary in-app Codex subagents remain acceptable only for text engineering
pilots. They are not the confirmatory runner because their shared workspace and
image handoff do not enforce the boundary above. Do not weaken this rule to make
a readiness gate appear green.

## Evidence required to close gates

| Gate area            | Minimum evidence                                                                         |
| -------------------- | ---------------------------------------------------------------------------------------- |
| Source integration   | Frozen source task IDs, adapter version, and a passing native smoke trace                |
| License/access       | Recorded terms review and required access approval; never commit credentials             |
| Fact parity          | Machine-readable per-task fact-key comparison across all eight methods                   |
| Hidden scoring       | Actor-readable packet audit plus scorer/gold isolation trace                             |
| Actor isolation      | Runner configuration proving tools/filesystem/evaluator access are disabled              |
| Multimodal transport | Captured request metadata proving screenshots are native model inputs                    |
| Runner identity      | Codex CLI version, effective model label, auth mode, config digest, and JSONL transcript |
| Calibration/power    | Sealed calibration IDs, parameters, simulation code, and power curves                    |

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
First show me the unchecked "Project-owner actions" and tell me which ones are
currently blocking your next technical step. The owner will not provide an API
key; use ChatGPT OAuth plus an externally isolated codex exec runner and preserve
the Codex-CLI-actor claim boundary. Do not ask the owner to paste any secret.
Do not collect or inspect confirmatory outcomes until every publication gate
passes. Do not invent benchmark data, silently substitute a baseline, expose
gold/scorers to an actor, estimate missing token usage, or call a pilot result
publication-grade. Commit each independently verified preparation milestone.
```
