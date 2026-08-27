# UGP v0.1 M5 release acceptance

Candidate: `0aebc56452ddade4d302e89b637d20620a9b041f`  
Protocol: UGP 0.1  
Decision: **PASS**

| Layer                                 | Result | Key evidence                                                                                  |
| ------------------------------------- | ------ | --------------------------------------------------------------------------------------------- |
| L0 — specification and Schema         | Pass   | 55/55 schema cases; 11/11 Core/Profile cases; generated types current                         |
| L1 — code and packages                | Pass   | strict checks; Core 95.22% branch coverage; browser packages ≥85%; 24 browser-component tests |
| L2 — automated E2E                    | Pass   | 188 passed, 2 expected Chromium-only skips; Chromium, Firefox, WebKit, Compact, DPR 2         |
| L3 — Codex Browser blackbox           | Pass   | ten screenshots, public Grounding/Context evidence, visible stale/permission/disabled checks  |
| L4 — performance, security, packaging | Pass   | all budgets met; 6/6 security tests; six tarballs consumed; no known vulnerabilities          |

## Performance highlights

- Registry 1K average: 3.66 ms; 10K: 30.31 ms; 1K added memory: 903,504 bytes.
- Point p95: 0.259 ms; Region p95: 0.388 ms.
- ContextBundle: 4,350 bytes and 20 referents.
- Brotli: Core 5,020 bytes; DOM 1,617 bytes; React 961 bytes.
- Leak lifecycle: 100 cycles returned to baseline.

## Defects and limitations

- Product defects: P0 0, P1 0, P2 0, P3 0.
- The in-app Browser input driver has no drag/wheel primitive; the
  same-candidate drag and recycled-scroll paths are covered by five real-browser
  projects and documented in the manual report.
- M6 release publishing, signed tag, SBOM, npm dry-run, changelog, and GitHub
  Release are intentionally not part of M5.

All M5 exit gates in `DEVELOPMENT_PLAN.md` and `ACCEPTANCE_PLAN.md` are
satisfied. This candidate is ready to enter M6 release work.
