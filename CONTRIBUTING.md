# Contributing to UGP

Thank you for helping make UI references interoperable and inspectable.

## Before starting

1. Read the terminology and relevant ADRs.
2. Open or claim an issue with objective, requirements, fixtures, acceptance,
   non-goals, and security impact.
3. For wire-format changes, add a failing conformance fixture before runtime
   implementation.

## Local checks

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm build
pnpm pack:smoke
```

DOM, geometry, overlay, Context, and adapter changes require their applicable
browser, end-to-end, performance, and security suites once those suites land.

## Commits and licensing

Sign off every commit with `git commit --signoff`. This certifies the DCO in
[`DCO.md`](DCO.md). Code contributions are Apache-2.0; documentation and
specification contributions are CC BY 4.0.

User-visible package changes require `pnpm changeset`. Keep generated protocol
types in sync with their source schemas; never edit generated types directly.

## Pull requests

Keep changes scoped. State which normative requirements and fixtures are
affected, attach test evidence, disclose Schema/API changes, and describe any
change to authority, staleness, or Context exposure.
