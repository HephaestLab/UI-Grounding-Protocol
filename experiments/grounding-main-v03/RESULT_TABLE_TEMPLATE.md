# Registered result tables

## Main fixed-actor causal table

Every benchmark cell is strict instance success (%). `Macro` is an unweighted
mean across the eight registered strata. A value is shown only with `n` and a
95% task-cluster bootstrap confidence interval in the camera-ready table.

| Grounding method          | Actor model  | ScreenPR Ref. | ScreenQA Visible ↓§ | DashboardQA-Ref† | WorkArena-QA-Ref† | WebMall-QA-Ref† | WorkArena++§ | WebMall Action | ST-WebAgentBench§ | Macro |
| ------------------------- | ------------ | ------------: | ------------------: | ---------------: | ----------------: | --------------: | -----------: | -------------: | ----------------: | ----: |
| Vision Only               | GPT-5.6 Luna |             — |                   — |                — |                 — |               — |            — |              — |                 — |     — |
|                           | GPT-5.4      |             — |                   — |                — |                 — |               — |            — |              — |                 — |     — |
| HTML/AX Subtree           | GPT-5.6 Luna |             — |                   — |                — |                 — |               — |            — |              — |                 — |     — |
|                           | GPT-5.4      |             — |                   — |                — |                 — |               — |            — |              — |                 — |     — |
| Tree-of-Lens → Actor‡     | GPT-5.6 Luna |             — |                   — |                — |                 — |               — |            — |              — |                 — |     — |
|                           | GPT-5.4      |             — |                   — |                — |                 — |               — |            — |              — |                 — |     — |
| IAI-P4‡                   | GPT-5.6 Luna |             — |                   — |                — |                 — |               — |            — |              — |                 — |     — |
|                           | GPT-5.4      |             — |                   — |                — |                 — |               — |            — |              — |                 — |     — |
| RAG Context‡              | GPT-5.6 Luna |             — |                   — |                — |                 — |               — |            — |              — |                 — |     — |
|                           | GPT-5.4      |             — |                   — |                — |                 — |               — |            — |              — |                 — |     — |
| MCP Resource (read-only)‡ | GPT-5.6 Luna |             — |                   — |                — |                 — |               — |            — |              — |                 — |     — |
|                           | GPT-5.4      |             — |                   — |                — |                 — |               — |            — |              — |                 — |     — |
| NLWeb Context‡            | GPT-5.6 Luna |             — |                   — |                — |                 — |               — |            — |              — |                 — |     — |
|                           | GPT-5.4      |             — |                   — |                — |                 — |               — |            — |              — |                 — |     — |
| **UGP**                   | GPT-5.6 Luna |             — |                   — |                — |                 — |               — |            — |              — |                 — |     — |
|                           | GPT-5.4      |             — |                   — |                — |                 — |               — |            — |              — |                 — |     — |

↓ Negative-control column: a large UGP advantage here is a diagnostic warning,
not supporting evidence.  
† Protocol-derived referent diagnostic built from the named source; not an
official benchmark split.  
‡ Fixed-actor adaptation/operationalization; not a claim of native-system
reproduction. § Pre-registered stratified subset, not the benchmark's full
leaderboard score.

## Native published systems table

This table uses each published system's own supported model/checkpoint and
native metric. Unsupported cells are `N/A`.

| Native system            | Version/checkpoint       | ScreenPR native | Mobile GUI native | WebMall native | Notes                                                    |
| ------------------------ | ------------------------ | --------------: | ----------------: | -------------: | -------------------------------------------------------- |
| Tree-of-Lens official    | pinned commit            |               — |               N/A |            N/A | Reproduce only after missing evaluation path is resolved |
| Ferret-UI official       | pinned commit/checkpoint |             N/A |                 — |            N/A | Separate checkpoint scope                                |
| UI-Hawk official         | pinned commit/checkpoint |             N/A |                 — |            N/A | Separate mobile/screen-stream scope                      |
| WebMall-Interfaces RAG   | pinned commit            |             N/A |               N/A |              — | Native interface stack                                   |
| WebMall-Interfaces MCP   | pinned commit            |             N/A |               N/A |              — | Native tool/interface stack                              |
| WebMall-Interfaces NLWeb | pinned commit            |             N/A |               N/A |              — | Native interface stack                                   |

## UGP ablation table

| UGP condition                         | Referent macro | Action macro | Safety CuP | Input bytes | Steps |
| ------------------------------------- | -------------: | -----------: | ---------: | ----------: | ----: |
| Full UGP                              |              — |            — |          — |           — |     — |
| − structured description summary      |              — |            — |          — |           — |     — |
| − subject/entity                      |              — |            — |          — |           — |     — |
| − role bindings                       |              — |            — |          — |           — |     — |
| − capabilities/operations             |              — |            — |          — |           — |     — |
| Equal-fact flat prose                 |              — |            — |          — |           — |     — |
| Full MCP tool channel (systems study) |              — |            — |          — |           — |     — |
