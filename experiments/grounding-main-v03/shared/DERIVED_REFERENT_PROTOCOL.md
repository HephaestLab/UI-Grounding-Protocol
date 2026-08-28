# Protocol-derived referent strata

`DashboardQA-Ref`, `WorkArena-QA-Ref`, and `WebMall-QA-Ref` are new diagnostic
strata derived from published benchmark environments. They are not official
benchmark splits.

## Construction

1. Freeze the source benchmark commit and source task pool.
2. Select tasks using the registered outcome-blind sampler.
3. Reset the official environment and capture the exact public UI state.
4. Link one user-like point/box/text selection to a source task referent that is
   necessary for answering or acting.
5. Derive the canonical entity and state from benchmark-owned structured data or
   evaluator configuration, never from an annotator's visual guess.
6. Render all eight grounding channels from the same fact inventory. Natural
   language summaries use frozen deterministic templates; a model may not write
   one condition's gold description.
7. Keep the source task ID, fact inventory, scorer, and alternative conditions
   outside actor packets.

## Audit sample and acceptance

Two independent reviewers verify at least 20% of each derived stratum, with a
minimum of 40 tasks per source where available. They review source identity,
selection geometry, necessary business facts, answer/action key, and whether the
selection is genuinely task-relevant.

Acceptance requires:

- 100% schema validity and source/evaluator referential integrity;
- at least 0.90 exact agreement on canonical entity identity;
- selection-box IoU at least 0.80 for 95% of audited items;
- Cohen's kappa at least 0.80 for categorical task relevance;
- zero unresolved critical disagreements after adjudication;
- byte-identical fact-key sets across semantic channels;
- no gold answer, expected action, source ID, or scorer key in actor packets.

Failed strata are repaired and re-audited on a fresh sample. Tasks are never
removed because a model condition performed poorly.

The reviewers are dataset annotators, not study participants; this audit does
not establish human-AI collaboration outcomes.
