# Benchmark license and access audit

Checked against the pinned local source snapshots on 2026-08-28. This is a
reproducibility record, not legal advice. Dataset, model-weight, application,
and hosted-service terms remain independently applicable.

| Source                  | Observed repository/data license                                                      | Access state                                                          | Decision before run                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| ScreenPR / Tree-of-Lens | MIT license file; Hugging Face card also reports MIT                                  | Public                                                                | Attribution/notice record required                                                         |
| ScreenQA                | CC BY 4.0 dataset                                                                     | Public JSON; RICO pixels are a separate dependency                    | Preserve attribution and verify RICO image terms                                           |
| BrowserGym              | Apache-2.0                                                                            | Public                                                                | Preserve notices                                                                           |
| WorkArena / WorkArena++ | Apache-2.0 code                                                                       | Instance configuration is gated and requires approval                 | Accept instance terms and record institutional approval                                    |
| WebMall                 | No root license file at pinned commit                                                 | Public code/self-hosted shops                                         | **Do not redistribute or begin confirmatory collection until authors/terms clarify reuse** |
| WebMall-Interfaces      | README points to a license file that is absent at pinned commit                       | Public code; also needs Elasticsearch and provider-dependent indexing | **Do not redistribute or begin confirmatory collection until authors/terms clarify reuse** |
| ST-WebAgentBench        | Repository states code and data are Apache licensed                                   | Public tasks/evaluator; web apps must be provisioned                  | Preserve notices; obtain a signing key only for official leaderboard submission            |
| Ferret-UI               | Apple sample-code terms; data/weight differentials are CC BY-NC 4.0 and research-only | Public code; checkpoints/upstream LLaMA/Vicuna terms apply            | Native-table research use only; review every model dependency                              |
| UI-Hawk / FunUI         | CC BY-NC-SA 4.0 repository                                                            | Public code/data/model dependent                                      | Native-table non-commercial research use only; preserve ShareAlike/attribution             |
| IAI-P4                  | Paper/project page; no runnable baseline identified                                   | Public publication                                                    | Cite as an operationalization, not redistributed software                                  |

The `licenseAndTermsApproved` gate remains false because WebMall and
WebMall-Interfaces have unresolved repository terms, WorkArena instance terms
have not been accepted, and third-party assets/models have not completed
institutional review.
