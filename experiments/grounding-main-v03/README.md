# UGP grounding main experiment v0.3

This directory is the frozen, auditable experiment harness for the CHI-style
evaluation of UGP. It supersedes the **RQ2 baseline design** in
`semantic-authoring-v02`; it does not replace that experiment's authoring study.

## What the main experiment measures

The main causal comparison fixes a deliberately small actor loop and varies
only:

1. the grounding/input method; and
2. the model used as the actor.

Every primary cell reports strict instance success (`0` or `1`). Official
benchmark metrics remain secondary so that unlike task families are not averaged
as though their native scores were interchangeable.

The registered main-table columns are:

| Capability stratum             | Benchmark column     | Status                            |
| ------------------------------ | -------------------- | --------------------------------- |
| Pointed referent recognition   | ScreenPR Referent    | Official source                   |
| Pixels-only visible QA         | ScreenQA Visible     | Official source; negative control |
| Long-horizon enterprise action | WorkArena++          | Official source                   |
| Long-horizon commerce action   | WebMall Action       | Official source                   |
| Policy-compliant web action    | ST-WebAgentBench CuP | Official source                   |

The registered method groups are Vision Only, HTML/AX, Tree-of-Lens adaptation,
IAI-P4 operationalization, WebMall-Interfaces RAG, read-only MCP Resource, NLWeb
context, and UGP. Each method has one row per actor model. The full table
therefore contains 16 rows and 80 primary cells. All five benchmark strata come
from published sources; the three proposed protocol-derived QA splits were
removed before outcome collection.

`Tree-of-Lens`, `IAI-P4`, and the three WebMall-Interfaces conditions are marked
as adaptations wherever the fixed-loop comparison changes their native system.
Native checkpoint/system reproduction is reported in a separate table and is
never mislabeled as the same causal comparison.

## Minimal actor loop

The actor receives one fresh packet at a time:

```text
observation -> selected grounding adapter -> fresh model context
            -> one JSON action/final answer -> benchmark executor -> repeat
```

The primary loop has no planner, memory, critic, reflection, model-generated
retry, or benchmark-specific helper. Every method uses the same action schema
and step budget inside a benchmark stratum. MCP is read-only context in the main
table; a full MCP tool agent is a secondary systems experiment.

See [`shared/ACTOR_PROTOCOL.md`](shared/ACTOR_PROTOCOL.md) for the wire
contract.

## Reproducible workflow

```bash
pnpm experiment:v03:validate
pnpm experiment:v03:doctor
pnpm experiment:v03:vendor:check
pnpm experiment:v03:preflight

# Local fixture proves the packet -> response -> deterministic score path.
pnpm experiment:v03:prepare -- --task fixtures/tasks/bi-kpi-qa.json --method ugp --model gpt-5.6-luna --run-id smoke
pnpm experiment:v03:record -- --request .runs/smoke/episodes/<episode-id>/request.json --response fixtures/responses/bi-kpi-correct.json
pnpm experiment:v03:score -- --trajectory .runs/smoke/episodes/<episode-id>/trajectory.json --gold fixtures/gold/bi-kpi-qa.gold.json
pnpm experiment:v03:summarize -- --run-id smoke
pnpm experiment:v03:analyze -- --run-id smoke --bootstrap 10000
```

For a clean-machine handoff, start with [`HANDOFF.md`](HANDOFF.md). It tells the
next Codex exactly what it may run immediately, what remains externally blocked,
and which evidence is required before any readiness gate can be changed.

`prepare` never writes gold data into an actor packet. `score` accepts the
answer key only after the trajectory exists and records only a digest plus
deterministic score. Publication runs must keep gold data outside the actor's
readable filesystem.

## Model execution modes

| Mode                  |               Fresh context | Model label controlled | Multimodal input            |        Exact usage | Hard tool/filesystem isolation | Claim level                |
| --------------------- | --------------------------: | ---------------------: | --------------------------- | -----------------: | -----------------------------: | -------------------------- |
| Codex subagent        | Yes, with a no-history task |                    Yes | No native image handoff now |                 No |                             No | Pilot/engineering evidence |
| Isolated model runner |                         Yes |                    Yes | Native text + image         | Provider-dependent |                            Yes | Confirmatory evidence      |

Codex subagents can run the experiment without a separately supplied API key,
but they share the repository and expose no guaranteed exact token accounting to
this harness. Their trajectories must therefore not be described as
publication-grade no-cheating evidence. The current subagent handoff also cannot
send screenshots as native image inputs while tools are disabled. The preflight
keeps both gates closed until an isolated multimodal runner or equivalent
external sandbox is present.

## Directory contract

- `design.json`: frozen factors, strata, metrics, sample plan, and analysis.
- `benchmark-manifest.json`: official entrypoints, pinned commits, licenses, and
  external prerequisites.
- `schemas/`: task, actor request/response, trajectory, and score contracts.
- `scripts/`: validation, environment doctor, packet lifecycle, scoring, and
  aggregation.
- `fixtures/`: non-benchmark smoke data; never included in reported results.
- `.runs/`: generated packets, traces, reports, and scores; ignored by Git.
- `.sealed/`: optional local answer-key staging; ignored by Git and still
  **not** a security boundary.

## What remains external

The harness intentionally does not fake dependencies it cannot provide:

- WorkArena requires approved access to the gated instance configuration.
- WebMall requires Linux/WSL plus Docker Compose and its shop services.
- ST-WebAgentBench publishes its tasks/evaluator, but still requires deployed
  WebArena/SuiteCRM services; its official leaderboard additionally uses a
  signing key.
- ScreenPR publishes data and model code but its repository still lists detailed
  setup/evaluation scripts as TODO.
- Publication-grade hard isolation cannot be guaranteed by Codex subagents.

Run `pnpm experiment:v03:preflight` for the machine-readable current gate
report.
