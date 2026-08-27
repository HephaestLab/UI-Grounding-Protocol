# UI Grounding Protocol v0.1

Status: **v0.1 Alpha Draft**

This document is the normative definition of the UGP v0.1 alpha line. JSON
Schemas are stable within a published alpha version but may change between alpha
releases with a Changeset and migration note.

The key words **MUST**, **MUST NOT**, **REQUIRED**, **SHOULD**, **SHOULD NOT**,
and **MAY** are to be interpreted as described in BCP 14 when, and only when,
they appear in all capitals.

## Scope

UGP converts a human selection over an application Surface into one or more
application-owned referents with explicit authority, evidence, freshness, and
minimal authorized context.

```text
Selection + Surface state -> deterministic resolution -> GroundingBundle
```

UGP does not define or execute actions. A conforming implementation MUST NOT
treat a resolved referent as authorization to mutate application state.

## Protocol invariants

- **UGP-REQ-VERSION-001:** Every serialized message MUST declare
  `ugpVersion: "0.1"`. Validation: envelope Schema and negative Fixture.
- **UGP-REQ-EXT-001:** Objects MUST reject unknown fields. Extension data MUST
  appear under `extensions`. Validation: Schema `additionalProperties` Fixture.
- **UGP-REQ-EXT-002:** Extension keys MUST use a reverse-domain name with at
  least two segments. Validation: extension-name pattern Fixture.
- **UGP-REQ-AUTHORITY-001:** Semantic claims MUST declare `authoritative`,
  `derived`, or `inferred` authority. A consumer MUST NOT upgrade authority.
  Validation: Schema Fixtures and resolver tests.
- **UGP-REQ-EVIDENCE-001:** Every ResolvedReferent MUST include at least one
  inspectable evidence record. Validation: Referent Schema Fixture.
- **UGP-REQ-REV-001:** Revisions MUST be monotonic within the lifetime and scope
  that owns them. Audit: Registry lifecycle tests.
- **UGP-REQ-REV-002:** A referent's Surface revision MUST equal the Selection's
  Surface revision. Validation: cross-object conformance Fixture.
- **UGP-REQ-REV-003:** When both are present, `expiresAt` MUST be later than
  `validAt`. Validation: cross-object conformance Fixture.
- **UGP-REQ-ACTION-001:** Implementations MUST NOT treat selection, resolution,
  context, or a CapabilityReference as authorization to execute an action.
  Audit: architecture and security review.

## Object model

The normative object shapes are the Draft 2020-12 Schemas in `schemas/`.
Generated language bindings are derivatives and MUST NOT override their source
Schema.

### Surface and identity

- **UGP-REQ-SURFACE-001:** A Surface MUST declare identity, URI, revision, trust
  boundary, supported modes, and conformance profiles.
- **UGP-REQ-SURFACE-002:** The trust boundary MUST be one of `same-origin`,
  `cross-origin`, or `sandboxed`.
- **UGP-REQ-TYPE-001:** A SemanticType MUST have a reverse-domain type name,
  title, description, and version.
- **UGP-REQ-TYPE-002:** Type names MUST satisfy the normative Schema pattern.
- **UGP-REQ-NODE-001:** A SemanticNode MUST declare instance identity, semantic
  type, label, authority, and its Anchor identities.
- **UGP-REQ-NODE-REL-001:** A SemanticNode MUST NOT name itself as its parent.

### Selection and anchors

- **UGP-REQ-ANCHOR-001:** A serializable DOM Anchor MUST include a Selector and
  the Surface revision it observed.
- **UGP-REQ-ANCHOR-002:** A Text Anchor MUST carry one or more Selectors.
- **UGP-REQ-ANCHOR-003:** An SVG Anchor MUST identify its SVG carrier.
- **UGP-REQ-ANCHOR-004:** A Canvas Anchor MUST identify its adapter and
  geometry.
- **UGP-REQ-ANCHOR-005:** A Virtual Anchor MUST use a stable application item
  key rather than a rendered row index.
- **UGP-REQ-ANCHOR-006:** Accessibility-derived Anchors MUST retain inferred
  provenance during resolution.
- **UGP-REQ-SELECTOR-001:** Selectors MUST use a registered discriminator and
  MUST NOT use visible text or CSS position as business identity.
- **UGP-REQ-SELECTOR-002:** A semantic Selector MUST include `entityRef`,
  `semanticType`, or `nodeId`.
- **UGP-REQ-GEOMETRY-001:** Geometry MUST declare its coordinate space.
- **UGP-REQ-GEOMETRY-002:** Rect width and height MUST be non-negative.
- **UGP-REQ-TEXT-001:** Text Quote selectors MUST include a non-empty exact
  quote; prefix and suffix are optional reconnect evidence.
- **UGP-REQ-TEXT-002:** Text Position `end` MUST be greater than or equal to
  `start`.
- **UGP-REQ-SELECTION-001:** Point selections MUST include point geometry.
- **UGP-REQ-SELECTION-002:** Region and lasso selections MUST include rect or
  polygon geometry.
- **UGP-REQ-SELECTION-003:** Text selections SHOULD combine Quote and Position
  selectors for deterministic reconnect.
- **UGP-REQ-SELECTION-004:** Selection source MUST be `human`, `application`, or
  `agent`; source does not grant authority.
- **UGP-REQ-SELECTION-005:** A Selection MUST include at least one Selector.

### Resolution, context, and problems

- **UGP-REQ-REFERENT-001:** A ResolvedReferent MUST include node identity, type,
  label, authority, relation, confidence, evidence, and Surface revision.
- **UGP-REQ-REFERENT-002:** Confidence MUST be between zero and one inclusive.
- **UGP-REQ-BUNDLE-001:** A GroundingBundle MUST bind one Selection to a
  bounded, ordered referent list and generation time.
- **UGP-REQ-AMBIGUITY-001:** Required disambiguation MUST include at least two
  candidates and a reason; implementations MUST NOT silently pick a tied item.
- **UGP-REQ-CONTEXT-001:** Context MUST be emitted as a minimal ReferentContext
  projection with freshness metadata.
- **UGP-REQ-CONTEXT-AUTH-001:** A ContextBundle MUST include the authorization
  purpose and whether fields were filtered.
- **UGP-REQ-CONTEXT-BUDGET-001:** Emitted bytes MUST NOT exceed requested bytes.
- **UGP-REQ-PROBLEM-001:** Failures MUST use a registered GroundingProblem code.
- **UGP-REQ-PROBLEM-002:** HTTP-like problem status, when present, MUST be in
  the 100–599 range.
- **UGP-REQ-ENVELOPE-001:** An envelope MUST identify the message, Surface,
  version, timestamp, type, and payload.
- **UGP-REQ-ENVELOPE-002:** Trace context, when present, MUST use W3C
  `traceparent` wire syntax.

## Unknown fields and extensions

Receivers MUST reject unknown fields rather than silently accept misspellings or
future semantics. A receiver MAY ignore extension entries whose reverse-domain
key it does not implement, but it MUST preserve them when transparently
forwarding a message. Extensions MUST NOT weaken authority, revision, context,
or security rules.

## Version and failure behavior

A receiver that does not support the declared `ugpVersion` MUST fail with a
typed protocol-version error at the transport boundary. Invalid objects MUST NOT
enter Registry or Resolver state. Resolution failures use GroundingProblem and
fail closed; no referent is preferable to a stale or unauthorized referent.

## Normative documents

- [Terminology](terminology.md)
- [Selection](selection.md)
- [Resolution](resolution.md)
- [Context](context.md)
- [Security](security.md)
- [Conformance](conformance.md)
- JSON Schemas in `schemas/`

## Conformance profiles

The v0.1 line defines Core, Point, Region, Text, Context, ComplexSurface, and
Inference profiles. DOM and React are implementation bindings that consume the
same profile Fixtures. A profile claim is valid only when all required Fixtures
for that profile pass.

## Versioning and extensions

The protocol version line is `0.1`. Additive extensions do not change this
value. A change to required fields or existing semantics requires a new protocol
version; a package-only implementation fix does not.
