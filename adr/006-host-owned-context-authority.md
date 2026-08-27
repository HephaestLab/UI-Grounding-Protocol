# ADR-006: Context authorization belongs to the host

- Status: Accepted
- Date: 2026-08-27

## Decision

Applications own ContextProviders and authorize requested projections before
materialization and budgeting. A resolved referent conveys identity, not access.
Providers expose explicit omission, freshness, cancellation, and truncation
metadata.

## Consequences

UGP core does not become a policy engine and cannot escalate access through
geometry, inference, or caller-supplied budgets.
