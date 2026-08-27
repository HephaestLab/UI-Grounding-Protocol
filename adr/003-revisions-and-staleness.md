# ADR-003: Revisions make stale state explicit

- Status: Accepted
- Date: 2026-08-27

## Decision

Semantic and adapter revisions are monotonically increasing within a Surface
lifetime. Selections record the revisions they observed. v0.1 fails closed when
the revisions needed for authoritative resolution are stale.

## Consequences

Filter changes, virtual row recycling, and canvas scene updates cannot silently
resolve against new meaning. Automatic stale re-resolution is deferred.
