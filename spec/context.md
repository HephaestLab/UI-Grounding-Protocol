# Context materialization

Status: **Normative v0.1 Alpha**

Context is an optional, post-resolution projection owned by the host
application. Providers enforce caller authorization before applying byte or
token budgets. Omitted, stale, truncated, unavailable, or cancelled context
carries an explicit reason. Cancellation uses `AbortSignal` in the TypeScript
binding.

Authorization precedes materialization: a larger budget cannot reveal a field
the principal or purpose may not access. Default bundle budget is 32 KiB, the
default referent limit is 20, and a brief context should remain within 2 KiB.
Larger content is represented by ResourceReference rather than inline binary or
an application store snapshot.

Context output is untrusted data for an agent. Visible instructions, labels, and
descriptions cannot modify authority, policy, or capability binding.
