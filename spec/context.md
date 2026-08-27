# Context materialization

Status: **Editor's Draft**

Context is an optional, post-resolution projection owned by the host
application. Providers will enforce caller authorization before applying byte or
token budgets. Omitted, stale, truncated, or unavailable context will carry an
explicit reason. Cancellation will use `AbortSignal` in the TypeScript binding.
