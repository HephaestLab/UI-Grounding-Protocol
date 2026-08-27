# UI Grounding Protocol

> Point at the interface. Get the ground truth behind it.

UGP is a vendor-neutral protocol for resolving human UI selections into
authoritative application referents.

```text
Human selection          UGP resolution             Application truth
click / region / text  ----------------------->  referent + evidence + context
```

It standardizes how clicks, marquee selections, text ranges, charts, canvas
objects, and virtualized UI map to stable business entities, minimal context,
and external capability references.

## What UGP is not

UGP is not an agent runtime, capability registry, browser automation framework,
action executor, or replacement for MCP/WebMCP.

It complements Agent Surface and other capability systems by answering:

> What application object did the user just point at?

Agent Surface describes what an agent can do. UGP identifies what the user
referred to. UGP never executes an action.

## Project status

UGP is in pre-alpha development. The v0.1 protocol, deterministic core, browser
bindings, reference overlay, and BI acceptance application are implemented. The
wire format and public runtime APIs remain subject to change until the Alpha
release candidate is signed.

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
```

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a change. The executable
roadmap is in [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md).

## License

Code is licensed under [Apache-2.0](LICENSE). Specification and documentation
are licensed under [CC BY 4.0](LICENSE-DOCS.md).
