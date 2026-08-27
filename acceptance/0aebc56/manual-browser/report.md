# Codex in-app Browser blackbox report

Candidate: `0aebc56452ddade4d302e89b637d20620a9b041f`  
Result: **PASS**

The production candidate was served only on `127.0.0.1`. The visible page
reported UGP 0.1, build `0aebc56`, and scenario revision `q-001`. No error
overlay, blank chart, or layout overflow was observed.

| Step                                   | Result | Visible observation                                                                                                                    | Evidence                                                                      |
| -------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| A — first screen and business controls | Pass   | Filter changed to East, sort advanced revision to q-003, table stayed populated                                                        | `01-dashboard-initial.jpg`; M5-14 tooltip test                                |
| B — DOM point                          | Pass   | Revenue → `metrics/revenue`, authoritative, anchor evidence present                                                                    | `02-kpi-point.jpg`; `grounding-bundles.json`                                  |
| C — Canvas                             | Pass   | Visible Canvas click resolved Revenue series; real drag resolved interval `revenue:2026-03..2026-05` in all five projects              | `03-canvas-selection.jpg`; M5-11                                              |
| D — SVG                                | Pass   | Visible East bar resolved `regions/east`; real brush returned stable East/West members in all five projects                            | `04-svg-member.jpg`; M5-15/M5-16                                              |
| E — virtual table                      | Pass   | Visible row `order-001724` matched Inspector; recycled mid-table row identity passed in all five projects                              | `05-virtual-row.jpg`; M5-18                                                   |
| F — text                               | Pass   | Text mode was visibly usable; native drag returned a text fragment with parent insight in all five projects                            | `06-text-mode.jpg`; M5-17                                                     |
| G — stale and permissions              | Pass   | Filter change visibly showed `SURFACE_STALE`; viewer omitted cost as unauthorized; analyst received cost and summary; no email visible | `07-stale-error.jpg`, `08-permission-viewer.jpg`, `09-permission-analyst.jpg` |
| H — disable UGP                        | Pass   | Inspector and overlay were removed; Filter and sort still worked; revision reached q-003 and eight rows remained visible               | `10-overlay-disabled.jpg`; M5-09/M5-14                                        |

## Input-driver note

The Codex in-app Browser controller available for this run exposes click,
double-click, typing, key press, and screenshot actions, but not pointer drag or
mouse-wheel actions. No prohibited browser workaround was used. Exact
drag/scroll paths were therefore executed against the same commit and
production-equivalent app with Playwright's real pointer input in Chromium,
Firefox, WebKit, Compact, and high-DPR projects. The in-app Browser
independently verified the resulting public Inspector UX, stale handling,
authorization projection, and disabled baseline.

## Defects

The run found and fixed three product defects before this final candidate:
filter state was lost after sorting, Canvas region drag was not routed to
interval resolution, and custom chart anchors became stale after Compact-layout
scrolling. The final candidate reproduces none of them. Open P0/P1/P2/P3 product
defects: **0/0/0/0**.
