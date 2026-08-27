# Performance release gate

`pnpm test:performance` measures deterministic Registry registration,
Point/Region resolution percentiles, retained memory, ContextBundle size,
resource cleanup, and minified+Brotli package size against the v0.1 budgets in
`ACCEPTANCE_PLAN.md`.

Run `pnpm build` first. Set `UGP_PERFORMANCE_REPORT` to write the JSON result to
a release-candidate evidence directory; otherwise the report is printed only.
