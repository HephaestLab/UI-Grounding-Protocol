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

UGP is in pre-alpha development. The current milestone establishes the protocol
workspace, terminology, architecture decisions, and automated quality gates. The
wire format and public runtime APIs are not stable yet.

## Repository map

- `spec/` — normative specification, terminology, and JSON Schemas
- `adr/` — accepted architecture decisions
- `packages/` — protocol, core, DOM, React, overlay, and testing packages
- `examples/` — browser-based conformance and integration labs
- `conformance/` — fixtures, runner, and reports
- `tests/` — browser, end-to-end, performance, and security suites
- `acceptance/` — release evidence and audit instructions

## Development

Requirements: Node.js 22.12 or newer and pnpm 11.19.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm build
pnpm pack:smoke
```

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a change. The executable
roadmap is in [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md).

## License

Code is licensed under [Apache-2.0](LICENSE). Specification and documentation
are licensed under [CC BY 4.0](LICENSE-DOCS.md).
