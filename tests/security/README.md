# Security release gate

`pnpm test:security` covers prompt injection as untrusted data, inferred
authority escalation, indistinguishable cross-tenant/not-found responses,
authorization-before-materialization, oversized and non-finite Selection data,
malicious Adapter fields, and invalid Context roles.

Production debug exposure and browser-console disclosure are also checked by the
M5 Playwright suite.
