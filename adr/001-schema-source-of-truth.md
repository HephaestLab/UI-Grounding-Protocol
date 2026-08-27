# ADR-001: JSON Schema is the wire-format source of truth

- Status: Accepted
- Date: 2026-08-27

## Decision

JSON Schema Draft 2020-12 files in `spec/schemas/` define the UGP wire format.
TypeScript types are generated from them and are not hand-edited. Cross-object
invariants that JSON Schema cannot express belong in conformance fixtures.

## Consequences

Schema changes begin with failing fixtures, generated artifacts are checked for
drift in CI, and the protocol package publicly exports schemas and types.
