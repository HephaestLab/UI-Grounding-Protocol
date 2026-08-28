# UGP semantic authoring study v0.2

Status: pre-experiment infrastructure. No run produced from this directory is
inferential until `readiness.json` reports every formal gate as passed and the
design is frozen by commit hash.

This study replaces neither UGP v0.1 conformance nor the historical
`experiments/chi-pilot` calibration. It evaluates the v0.2 research candidate
described in `RESEARCH_PLAN_V0.2.md`.

## Study map

- **RQ1 / authoring:** eight frontend tasks: BI, document, workflow, and
  commerce, each in greenfield and retrofit form.
- **RQ2 / transfer:** independent agents interpret selected referents under
  DOM/AX, equal-fact application-specific sidecar, and UGP Capsule conditions.
- **Human study:** protocol placeholder only. No model-only run is evidence of
  human-AI shared grounding.

RQ1 conditions are conventional, equal-fact generic sidecar, and UGP. The UGP
arm receives exactly one frozen authoring Skill: `ugp-build` for greenfield or
`ugp-retrofit` for existing applications. Participant models never design task
requirements, Profiles, hidden acceptance, or scoring.

## Prepared commands

```sh
pnpm experiment:v02:validate
pnpm experiment:v02:preflight
pnpm experiment:v02:prepare -- --study RQ1 --task bi-greenfield --condition ugp --replicate 1 --model gpt-5.6-luna --reasoning medium
pnpm experiment:v02:score -- --run <run-id>
pnpm experiment:v02:transfer:prepare -- --condition ugp --replicate 1 --model gpt-5.6-luna --reasoning medium
pnpm experiment:v02:transfer:reveal -- --run <run-id>
pnpm experiment:v02:transfer:score -- --run <run-id>
```

`prepare` creates an opaque packet in `.runs/<run-id>/participant` and a
separate private manifest. It does not invoke a model. `score` refuses missing
audit records and is calibration-only while the design status is not `frozen`.
The transfer commands preserve one participant context across known examples, an
initially held-out commerce domain, and a controlled phase-two guide reveal.

The current Codex subagent runner has shared filesystem access. Packet contents
are hidden procedurally, not by a hard sandbox. Formal claims must disclose that
limitation unless collection moves to an isolated runner.
