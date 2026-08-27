# ADR-007: React observes a framework-independent external store

- Status: Accepted
- Date: 2026-08-27

## Decision

The Registry is framework-independent. React bindings subscribe with
`useSyncExternalStore`, use callback refs for Anchors, and make registration
idempotent under Strict Mode effect replay. Server rendering is inert until
hydration enables a Surface.

## Consequences

React is a peer dependency and Core has no React lifecycle dependency.
