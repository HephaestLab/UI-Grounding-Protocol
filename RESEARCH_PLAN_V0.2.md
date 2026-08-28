# UGP v0.2 research and experiment-readiness plan

Status: implementation candidate; no v0.2 inferential runs may start until all
gates in this document pass.

Update (2026-08-28): this document remains the plan for the authoring study and
protocol candidate. Its original RQ2 three-arm consumer design is superseded by
the frozen fixed-actor grounding study in
[`experiments/grounding-main-v03/`](experiments/grounding-main-v03/README.md).
The equal-fact application-specific sidecar is retained there as an ablation;
published grounding/interface methods form the main comparison.

Protocol compatibility: UGP v0.1 remains the accepted grounding baseline. The
v0.2 work is additive and lives under `spec/drafts/v0.2` until the research
candidate is accepted.

## 1. Research thesis

UGP tests whether application meaning can survive the complete semantic round
trip:

```text
business model
  -> AI-authored or AI-retrofitted frontend
  -> visible user selection
  -> structured business description
  -> independent-agent interpretation or capability use
```

The protocol is not a semantic component library, a domain ontology, a chat UI,
or an action executor. It standardizes the smallest verifiable bridge between a
visible referent and application-owned meaning.

## 2. Two research questions

### RQ1: semantics-preserving frontend authoring

Can an AI coding agent build a new frontend or minimally retrofit an existing
frontend with UGP while preserving functional quality, visual quality, and
development efficiency?

- RQ1a evaluates greenfield authoring with `ugp-build`.
- RQ1b evaluates minimum-change retrofit with `ugp-retrofit`.
- Functional and visual outcomes are non-inferiority outcomes.
- Semantic correctness, preservation, and cross-consumer interoperability are
  superiority outcomes.

### RQ2: independent-agent semantic transfer

Does a UGP description improve an independent agent's ability to understand a
selected business referent and choose valid next capabilities across
applications and domains?

The primary comparison is UGP versus an equal-fact, application-specific sidecar
representation. DOM/AX remains a diagnostic lower-information baseline, not the
primary standardization baseline.

Human-participant evidence is outside the current preparation scope. No
model-only result may be described as proof of human-AI collaboration quality.

## 3. Non-negotiable design constraints

1. **One core grammar, many profiles.** A new domain may add frame definitions,
   roles, and capability adapters. It may not add a new top-level Capsule field.
2. **Immediate meaning plus lossless expansion.** The Capsule carries a compact,
   self-contained Description. Larger definitions, data lineage, and tools are
   resolved on demand.
3. **Application truth over UI inference.** Visible text may supply a label. It
   may not establish canonical identity, authority, state meaning, or action
   permission.
4. **Sidecar semantics with typed links.** Domain profiles and mappings live
   outside view components. Components keep only a lifecycle-safe link to a
   typed Binding.
5. **Headless core, optional UI.** Selection and semantic resolution work
   without the Inspector. The Inspector is a reference consumer.
6. **Discovery is not authority.** A listed capability is not a bearer token.
   The host re-authorizes every invocation.
7. **No hidden semantic invention.** If the authoring agent cannot find an
   authoritative source, it reports an unresolved gap instead of guessing.
8. **Task-sufficient minimality.** A default Description answers what, current
   value/state, scope, basis, and available next step when those concepts apply.
   Larger detail is expanded only when requested.

## 4. v0.2 object model

### SemanticValue

A small recursive value grammar shared by every domain:

- JSON scalar;
- quantity with unit;
- entity reference;
- time instant or interval;
- collection;
- nested semantic frame.

### SemanticFrame

A typed business statement with one subject and named roles. The Core does not
know what role names such as `metric`, `noticePeriod`, `assignee`, or `total`
mean. A Profile defines and validates them.

### ProfileDefinition

A reusable vocabulary contract that defines frame types, required roles, role
value kinds, optional vocabularies, a deterministic summary template, and
compatible capability identifiers.

### SemanticBinding

An authoring-time, typed sidecar mapping from real application data to a
SemanticFrame. Bindings are executable SDK code rather than wire-protocol JSON.
They are responsible for canonical subject identity, roles, revision, and
capability references.

### GroundingCapsule

The compact agent-facing result:

```text
version + grounding id + surface revision
  + structured Description(summary + frame)
  + capability identifiers
  + optional grounding problem
```

The existing v0.1 GroundingBundle remains the diagnostic record containing
selection geometry, ranking evidence, omissions, and ambiguity details. The
Capsule is compiled from that record and the registered semantic Binding.

## 5. Authoring layout

Greenfield and retrofit workflows generate the same project structure:

```text
src/ugp/
  manifest.ts
  profiles/
  bindings/
  capabilities/
  surfaces/
  tests/
```

View components import a Binding and establish a link. They do not embed the
frame definition, natural-language description, capability schema, API route, or
authorization logic.

## 6. Product layers and ownership

```text
Application data and business rules
          |
          v
Profile + typed sidecar Binding       Authoring layer
          |
          v
Semantic Registry + selection resolver Headless runtime
          |
          +--> GroundingCapsule callback Consumer boundary
          |
          +--> optional Inspector       Reference UI
```

UGP owns the output contract and the ability identifiers. The host application
owns model selection, conversations, tool execution, identity, authorization,
confirmation, and audit storage.

## 7. Two authoring skills

### `ugp-build`

For a new frontend. It derives competency questions and profiles before view
implementation, builds typed bindings, links components, and verifies semantic
round trips alongside normal product acceptance.

### `ugp-retrofit`

For an existing frontend. It first freezes functional and visual baselines,
traces authoritative data flow without editing, creates sidecar artifacts, adds
the smallest lifecycle-safe links, and rejects unrelated refactoring. It must
produce a semantic-gap report for facts it cannot establish.

Both skills follow the same source-authority order:

```text
domain model / semantic layer
  > API schema and state machine
  > validated application state and component props
  > visible DOM or text
```

## 8. Inspector scope

The optional Inspector provides:

- point, region, and text selection;
- visible highlighting;
- structured Description and raw Capsule views;
- ambiguity, stale-state, and missing-description feedback;
- capability discovery;
- an `onGrounding(capsule)` callback.

It does not contain a model loop, API credentials, arbitrary fetch logic,
business authorization, or action execution.

## 9. Experiment matrix

The preparation corpus covers four structurally different domains:

| Domain   | Primary frame shape                        | Complex surface       |
| -------- | ------------------------------------------ | --------------------- |
| BI       | observation, value, scope, query reference | chart / virtual table |
| Document | clause, parties, effect, time              | text range / editor   |
| Workflow | state, actor, input, precondition          | Canvas / graph node   |
| Commerce | entity, state, amount, relations           | record table / form   |

For RQ1, each domain includes one greenfield task and one retrofit task. Each
task has three arms:

- conventional frontend requirement;
- equal-fact application-specific sidecar;
- UGP using the appropriate frozen skill.

For RQ2, independent consumers receive equal business facts under DOM/AX,
application-specific sidecar, and UGP conditions. Held-out tasks include a new
application and at least one held-out domain. UGP Core remains frozen; only a
Profile and adapter may be added for the held-out domain.

## 10. Primary outcomes

### RQ1

- hidden functional-test pass rate;
- blinded visual non-inferiority;
- first-pass acceptance;
- repair rounds and patch size;
- semantic coverage and frame validity;
- exact selection-to-frame round trip;
- UI/semantic revision consistency;
- unresolved facts reported rather than invented;
- retrofit visual and behavioral regression rate.

### RQ2

- exact business-referent recovery;
- structured-description comprehension;
- capability selection accuracy;
- valid bound-argument rate;
- unauthorized or fabricated capability-call rate;
- held-out application and domain transfer;
- application-specific adapter code and documentation cost.

## 11. Experimental-model boundary

Experimental models are participants only. They do not write or revise the
research questions, task requirements, profiles, hidden tests, or scoring
oracles. Participant runs use fresh contexts and opaque identifiers. Calibration
is excluded from inference.

The current Codex subagent environment provides procedural, not hard, filesystem
isolation. Formal reporting must disclose this unless a future runner provides
per-run filesystem isolation and platform-attested model/tool logs.

## 12. Gates before any inferential run

- v0.2 schemas and generated types are byte-stable;
- Core/Profile conformance covers all required and negative cases;
- the same Profile and Capsule grammar validate all four domains;
- adding the held-out domain changes no Core schema;
- both skills pass independent forward tests on unseen starter projects;
- retrofit tasks show zero baseline visual/functional regression before model
  participation;
- every task's controlled business facts match between ad-hoc and UGP arms;
- hidden tests and oracles are absent from participant packets;
- a complete pre-run file manifest is recorded and immutable;
- scoring the same artifact twice is byte-for-byte stable;
- task reset succeeds at least 49 of 50 times;
- no calibration task has a ceiling or floor across every primary arm;
- model, reasoning setting, prompt, input bytes, output bytes, wall clock, and
  available audit metadata are preserved without claiming unobservable token
  counts.

## 13. Implementation sequence

1. Freeze the draft schemas and authoring contract.
2. Implement Profile validation, typed Bindings, description registration, and
   Capsule compilation.
3. Add React links and a framework-neutral runtime path.
4. Extract the Inspector from the existing overlay/demo behavior.
5. Create and validate both Skills.
6. Build the four-domain greenfield and retrofit task packets plus deterministic
   validators and hidden oracles.
7. Run infrastructure calibration only.
8. Freeze the inferential design after calibration gates pass.

No formal hypothesis test starts as part of steps 1-6.
