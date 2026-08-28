# Benchmark license and access audit

Checked against the pinned local source snapshots on 2026-08-28. This is a
reproducibility record, not legal advice. Dataset, model-weight, application,
and hosted-service terms remain independently applicable.

| Source                  | Observed repository/data license                                                      | Access state                                                          | Decision before run                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| ScreenPR / Tree-of-Lens | MIT license file; Hugging Face card also reports MIT                                  | Public                                                                | Attribution/notice record required                                                                           |
| ScreenQA                | CC BY 4.0 dataset                                                                     | Public JSON; RICO pixels are used from the local research copy        | Preserve attribution; do not redistribute the local pixel corpus                                             |
| BrowserGym              | Apache-2.0                                                                            | Public                                                                | Preserve notices                                                                                             |
| WorkArena / WorkArena++ | Apache-2.0 code                                                                       | Instance configuration is gated and requires approval                 | Accept instance terms and record institutional approval                                                      |
| WebMall                 | No root license file at pinned commit                                                 | Public benchmark code and locally self-hosted shops                   | Project owner approved the local research run; cite the benchmark and do not redistribute it                 |
| WebMall-Interfaces      | README points to a license file that is absent at pinned commit                       | Public code; also needs Elasticsearch and provider-dependent indexing | Project owner approved local use of the registered interface conditions; do not redistribute upstream assets |
| ST-WebAgentBench        | Repository states code and data are Apache licensed                                   | Public tasks/evaluator; web apps must be provisioned                  | Preserve notices; obtain a signing key only for official leaderboard submission                              |
| Ferret-UI               | Apple sample-code terms; data/weight differentials are CC BY-NC 4.0 and research-only | Public code; checkpoints/upstream LLaMA/Vicuna terms apply            | Native-table research use only; review every model dependency                                                |
| UI-Hawk / FunUI         | CC BY-NC-SA 4.0 repository                                                            | Public code/data/model dependent                                      | Native-table non-commercial research use only; preserve ShareAlike/attribution                               |
| IAI-P4                  | Paper/project page; no runnable baseline identified                                   | Public publication                                                    | Cite as an operationalization, not redistributed software                                                    |

On 2026-08-29, the project owner approved local research execution of the four
available benchmark strata: ScreenPR, ScreenQA, WebMall Action, and
ST-WebAgentBench. This approval covers local execution and aggregate result
reporting, not redistribution of third-party datasets, application images, or
model assets. The four-benchmark phase therefore has no remaining access gate.

WorkArena remains a separate pending-access stratum. Its instance terms and
runtime gate stay open until the requested access is granted; no WorkArena
outcomes are included in the four-benchmark phase.
