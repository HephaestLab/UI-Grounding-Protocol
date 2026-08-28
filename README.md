# UI Grounding Protocol

> Agent-ready frontends by construction. Shared application meaning for people
> and AI.

![UGP architecture: embed semantics at build time and ground selections to application truth at runtime](assets/diagrams/ugp-framework-overview-en.png)

UI Grounding Protocol (UGP) is a testable application-level semantic contract.
It connects visible interface objects to authoritative business referents,
evidence, scope, and permission-filtered context so that a frontend remains
fully usable by people while becoming reliably understandable to independent AI
agents.

The research thesis behind UGP is:

> Agent-era frontend development should preserve application semantics as a
> first-class, testable contract, enabling people and AI to establish reliable
> shared reference through the interface.

## Why application semantics

Pixels, DOM, and accessibility trees expose valuable presentation and control
semantics. They can tell an agent that something is a chart, row, button, or
selected item. They usually cannot authoritatively answer:

- Which business entity does this visible object represent?
- Which filters, time range, aggregation, and permission scope produced it?
- Is the evidence current, ambiguous, derived, or stale?
- When a person says “explain this” or “compare these,” what exactly did they
  refer to?

UGP complements control-level semantics with application-level meaning:

| Control-level semantics | Application-level semantics                     |
| ----------------------- | ----------------------------------------------- |
| role, name, state       | entity type, identity, relation, scope          |
| “This is a button”      | “This approves order 123”                       |
| “This bar is selected”  | “This represents confirmed Q2 revenue for East” |
| supports interaction    | supports shared human–AI reference              |

We call this **application-level semantic accessibility**: exposing the minimum
authorized business meaning that an independent AI needs to understand what a
person is seeing and referring to. UGP does not copy backend code, SQL, or
private records into the page. It provides a **task-sufficient semantic
projection** that is structured, versioned, permission-filtered, and expandable
on demand.

## The semantic round trip

UGP is designed to preserve application meaning across the complete lifecycle,
not to annotate a finished interface as an afterthought:

```text
Business intent
      ↓
AI-assisted frontend development
      ↓  preserves a testable semantic contract
Visual UI  ←→  task-sufficient semantic projection
      ↓                         ↓
Human selection          independent AI understanding
      └──────── reliable shared grounding ────────┘
```

The coding agent that builds an interface and the assistant that later reads it
need not be the same model. A successful semantic round trip means domain
identity and scope survive requirement, generation, rendering, selection, and AI
interpretation.

## Research focus

The project deliberately focuses on two scientific questions.

### RQ1 — Semantic preservation by construction

Can AI coding agents generate and modify UGP-enabled frontends without reducing
normal frontend quality or productivity?

The study evaluates functional and visual non-inferiority, first-pass success,
repair effort, runtime overhead, and semantic-contract correctness. The goal is
not merely to show that agents can add annotations; it is to test whether
application meaning can remain correct as the interface evolves.

### RQ2 — Semantic sufficiency and shared grounding

Do semantics-preserving frontends improve cross-application AI understanding and
human–AI collaboration?

This question requires two complementary forms of evidence:

- **Independent-agent benchmark:** held-out applications, business-referent
  identification, safe-action decisions, and application-specific adaptation
  cost.
- **Human–AI study:** wrong-object rate, clarification and correction count,
  task time, and users' ability to establish confidence that the agent is acting
  on the intended business object.

The strong semantic baseline is not an information-poor DOM. UGP is compared
with application-specific ad-hoc JSON containing the same business facts. This
tests the value of a shared contract rather than the trivial benefit of giving
one condition more information.

## Human–AI shared grounding

Consider a person pointing at a revenue card and asking, “Why did this fall?”
The visible label alone may not reveal whether the metric is confirmed revenue,
forecast revenue, or a permission-filtered aggregate. A UGP resolution can
identify the metric, its current scope and revision, the evidence behind the
selection, and authorized references for further explanation.

The protocol does not perform the explanation or execute an action. It creates
the reliable common reference that makes the subsequent collaboration safer:

```text
person points at UI
  → UGP resolves business referent and evidence
  → host materializes authorized context
  → assistant explains its interpretation
  → person can confirm, correct, or continue
```

## What UGP standardizes

UGP resolves clicks, region selections, text ranges, charts, canvas objects, and
virtualized UI into:

- stable application-owned referents;
- authority and grounding evidence;
- ambiguity and staleness signals;
- minimal, permission-filtered context;
- references to external capabilities without granting execution authority.

```text
Human selection          UGP resolution             Application truth
click / region / text  ----------------------->  referent + evidence + context
```

## What UGP is not

UGP is not an agent runtime, capability registry, browser automation framework,
action executor, or replacement for MCP/WebMCP. It does not replace ARIA or the
accessibility tree; it builds on control-level evidence and adds
application-owned business meaning.

Agent Surface and capability systems describe what an agent can do. UGP
identifies what the person referred to and what that visible object means. UGP
never executes the action.

## Project status

UGP currently has two connected tracks:

| Track                                 | Status                                                                                 |
| ------------------------------------- | -------------------------------------------------------------------------------------- |
| Protocol and reference implementation | v0.1 M5 acceptance **PASS**; M6 Alpha release work remains                             |
| CHI-oriented research                 | experiment infrastructure and Luna calibration complete; inferential Pilot not started |

The v0.1 protocol, deterministic core, browser bindings, reference overlay, and
BI acceptance application are implemented. The wire format and public runtime
APIs remain pre-alpha until the release candidate is signed. See the
[M5 acceptance evidence](acceptance/0aebc56/summary.md).

The research calibration currently shows that application-owned semantics can
recover information missing from DOM/AX evidence, while equal-fact ad-hoc JSON
and UGP perform similarly in single applications. It does **not** yet establish
that UGP improves human–AI collaboration or outperforms ad-hoc schemas. The next
stage measures shared-contract reuse across held-out applications, followed by a
separately reviewed human study. See the
[CHI Pilot workspace](experiments/chi-pilot/README.md) and
[calibration record](experiments/chi-pilot/calibration-log.md).

## Quick Start

Requires Node.js 22.13 or newer. Once the Alpha packages are published:

```sh
pnpm add @ui-grounding/core @ui-grounding/dom @ui-grounding/protocol
```

Register an application-owned semantic node and its visible DOM anchor, then
resolve a user selection against a stable Registry snapshot:

```ts
import { resolveSelection, SemanticRegistry } from '@ui-grounding/core';
import { DomAnchorRegistry } from '@ui-grounding/dom';

const registry = new SemanticRegistry({
  surfaceId: 'surface:orders',
  surfaceRevision: '1',
});
const dom = new DomAnchorRegistry({ registry });
const element = document.querySelector('[data-order-id="42"]')!;

const semanticNode = registry.registerNode({
  nodeId: 'order:42',
  type: 'com.example.order',
  label: 'Order 42',
  authority: 'authoritative',
  entityRef: { namespace: 'orders', id: '42' },
  anchorIds: [],
});
const anchor = dom.register(element, 'order:42');
const rect = element.getBoundingClientRect();
const geometry = {
  kind: 'point' as const,
  coordinateSpace: 'viewport' as const,
  x: rect.left + rect.width / 2,
  y: rect.top + rect.height / 2,
};

const grounding = resolveSelection(registry.getSnapshot(), {
  selectionId: 'selection:order-42',
  surfaceId: registry.surfaceId,
  mode: 'point',
  selectors: [{ type: 'UGPGeometrySelector', geometry }],
  geometry,
  surfaceRevision: registry.surfaceRevision,
  createdAt: new Date().toISOString(),
  source: 'human',
});

console.log(grounding.referents[0]?.entityRef); // orders / 42

anchor.dispose();
semanticNode.dispose();
dom.dispose();
registry.dispose();
```

Before the npm Alpha exists, `pnpm build && pnpm pack:smoke` reproduces this in
a completely clean temporary consumer using the locally packed tarballs. It also
verifies ESM imports, TypeScript types, the React peer, tree shaking, and the
explicit `@ui-grounding/overlay/styles.css` export.

## Repository map

- `spec/` — normative specification, terminology, and JSON Schemas
- `adr/` — accepted architecture decisions
- `packages/` — protocol, core, DOM, React, overlay, and testing packages
- `examples/` — browser-based conformance and integration labs
- `conformance/` — fixtures, runner, and reports
- `tests/` — browser, end-to-end, performance, and security suites
- `acceptance/` — release evidence and audit instructions
- `experiments/` — CHI study design, task packets, scoring, and calibration

## Development

Requirements: Node.js 22.13 or newer and pnpm 11.19.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm build
pnpm test:browser
pnpm test:e2e
pnpm test:performance
pnpm test:security
pnpm pack:smoke
pnpm experiment:validate
```

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a change. The executable
implementation roadmap is in [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md), and the
research protocol is in
[experiments/chi-pilot/preregistration.md](experiments/chi-pilot/preregistration.md).

## License

Code is licensed under [Apache-2.0](LICENSE). Specification and documentation
are licensed under [CC BY 4.0](LICENSE-DOCS.md).
