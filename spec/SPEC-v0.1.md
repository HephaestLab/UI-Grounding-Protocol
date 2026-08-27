# UI Grounding Protocol v0.1

Status: **Editor's Draft**

This document will become the normative definition of UGP v0.1. Until its status
changes, the JSON Schemas and runtime APIs are not stable.

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHOULD**, **SHOULD NOT**,
and **MAY** are to be interpreted as described in BCP 14 when, and only when,
they appear in all capitals.

## Scope

UGP converts a human selection over an application surface into one or more
application-owned referents with explicit authority, evidence, freshness, and
minimal authorized context.

```text
Selection + Surface state -> deterministic resolution -> GroundingBundle
```

UGP does not define or execute actions. A conforming implementation MUST NOT
treat a resolved referent as authorization to mutate application state.

## Normative documents

- [Terminology](terminology.md)
- [Selection](selection.md)
- [Resolution](resolution.md)
- [Context](context.md)
- [Security](security.md)
- JSON Schemas in `schemas/` (introduced in milestone M1)

## Conformance profiles

The first draft will define Core, DOM, Text, React, and Adapter profiles. A
profile claim is valid only when all required fixtures for that profile pass.

## Versioning and extensions

The protocol version line is `0.1`. Rules for unknown fields, extension names,
compatibility, and failure behavior will be frozen with the M1 schemas.
