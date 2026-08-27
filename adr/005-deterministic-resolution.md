# ADR-005: Resolution is a deterministic pipeline

- Status: Accepted
- Date: 2026-08-27

## Decision

Resolution validates, collects, rejects, scores, orders, collapses,
deduplicates, and classifies ambiguity in a documented order. Stable
tie-breakers are normative. Inferred claims never override authoritative ones.

## Consequences

The same registry snapshot and Selection produce byte-equivalent semantic
results independent of DOM, React, a model, or network access.
