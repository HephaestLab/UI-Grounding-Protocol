# UGP CHI Pilot

This directory contains the frozen, model-independent experiment definition for
evaluating UGP as an application-level semantic contract. Experimental models
execute prepared participant packets; they do not design tasks, see condition
labels, or access the scoring oracle during a run.

## Scientific scope

The study asks two questions only:

- **RQ1 — Semantic preservation:** Does requiring an AI coding agent to produce
  a UGP semantic contract preserve functional quality, visual quality, and
  development efficiency relative to conventional and generic-semantic
  instructions?
- **RQ2 — Semantic sufficiency and shared grounding:** Does a standardized,
  task-sufficient semantic projection improve independent-agent understanding
  and help people and AI establish the same business referent?

RQ1 is evaluated as a non-inferiority problem for normal frontend quality and
cost, plus a superiority problem for semantic correctness. RQ2 is evaluated as a
superiority problem on held-out applications and, separately, as a
within-participant human–AI collaboration study. Exact hidden reasoning tokens
are not observable in the Codex subagent runner and are not an outcome.

## Evidence plan

RQ2 uses two linked studies rather than treating model-only accuracy as evidence
of human collaboration:

- **RQ2a — independent-agent transfer:** referent recovery, safe-action
  decisions, and application-specific adaptation cost on held-out applications;
- **RQ2b — human–AI shared grounding:** wrong-object rate, clarification and
  correction count, task time, and confidence that the agent is operating on the
  intended business object.

The automated reader tasks in this directory currently calibrate only the RQ2a
infrastructure. No human–AI collaboration result has been collected. A human
study requires a separately frozen protocol, participant plan, consent flow, and
the applicable ethics review before recruitment.

## Conditions

| Study | Internal condition | Participant receives                                       |
| ----- | ------------------ | ---------------------------------------------------------- |
| RQ1   | `conventional`     | ordinary product requirement                               |
| RQ1   | `generic`          | requirement plus stable IDs and application-specific JSON  |
| RQ1   | `ugp`              | requirement plus frozen UGP contract and conformance tests |
| RQ2   | `dom`              | visible text and a sanitized DOM/AX snapshot               |
| RQ2   | `adhoc`            | application-specific JSON containing the controlled facts  |
| RQ2   | `ugp`              | UGP bundle containing the same controlled facts            |

The primary RQ2 comparison is `ugp` versus `adhoc`. Each task manifest lists a
controlled fact set, and `experiment:validate` rejects semantic arms that do not
declare identical fact IDs.

## Blinding and run lifecycle

1. Validate and freeze the design, task, prompt, inputs, and oracle.
2. Prepare one randomized run packet in `.runs/<run-id>/participant`.
3. Give an experimental model only that participant directory, using a fresh
   conversation with no inherited turns.
4. The model writes `answer.json` in the participant directory.
5. After the model stops, score from the parent task with the private oracle.
6. Preserve the manifest, answer, score, timestamps, model label, reasoning
   setting, and observable tool-call count.

The Codex subagent environment shares a filesystem with the parent process. The
participant instruction forbids repository-wide search, and the participant
packet contains no oracle, but this is procedural rather than hard sandbox
isolation. A future API/container runner must provide filesystem isolation
before the main experiment is described as fully blinded.

## Commands

```sh
pnpm experiment:validate
pnpm experiment:prepare -- --task reader-bi-ambiguous-record --condition ugp --replicate 1 --model gpt-5.6-luna --reasoning medium
pnpm experiment:score -- --run <run-id>
pnpm experiment:session:prepare -- --session reader-transfer-three-domain --condition ugp --replicate 1 --model gpt-5.6-luna --reasoning medium
pnpm experiment:session:reveal -- --run <run-id>
pnpm experiment:session:score -- --run <run-id>
```

The two-phase transfer session preserves one model context across known and
held-out applications. Its phase-one packet contains no held-out oracle or
adaptation guide. Phase two reveals an application-specific guide only when the
condition requires one, then scores both the initial and final answers.

All completed runs remain infrastructure calibration and are not evidence for
either hypothesis. The first transfer calibration found that Luna inferred the
meaningful ad-hoc schema without its held-out guide while UGP used more input
bytes; that task was therefore rejected for inference. See
`transfer-session-summary.json`. Formal Pilot collection starts only after the
gates in `preregistration.md` pass.
