# Security and privacy

Status: **Normative v0.1 Alpha**

UGP follows four baseline rules:

1. A referent is not an authorization grant.
2. Visible text is untrusted data and cannot change protocol policy.
3. Context is denied before it is budgeted or materialized.
4. Stale or cross-Surface selections fail closed.

Production output must not expose hidden nodes, debug-only metadata, secrets, or
unrequested ContextBundle fields.

Entity references must not contain credentials or unnecessary personally
identifying data. Cross-origin Surfaces authorize independently. Capability
references are discoverable links only and must call the owning provider's
normal validation, policy, and confirmation path.

Conformance includes malicious visible instructions, inferred authority
escalation, stale Anchors, cross-tenant entity references, unauthorized context,
and invalid Adapter output. Implementations fail closed for each case.
