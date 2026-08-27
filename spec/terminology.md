# UGP terminology

Status: **Accepted for M0**

These terms are deliberately narrow. Implementations and documentation should
not substitute `component`, `entity`, or generic `node` when the defined UGP
term is intended.

## Surface

A bounded application scope whose semantic state and revision are managed as one
unit.

- Positive: one dashboard tab with a stable `surfaceId` and revision.
- Negative: the entire browser, merely because it contains the dashboard.
- Boundary: a same-origin iframe is a separate Surface unless a host explicitly
  bridges it.

## SemanticNode

An application-declared semantic object that can participate in grounding. Its
`nodeId` identifies an instance within a Surface lifetime.

- Positive: the metric node representing “Net revenue” in a KPI card.
- Negative: an arbitrary wrapper `div` with no application meaning.
- Boundary: two views of the same record are two SemanticNodes that may share
  one `entityRef`.

## Anchor

A visible or addressable carrier that connects a SemanticNode to a selectable
location or range.

- Positive: a DOM element, SVG shape, canvas hit region, or text range.
- Negative: a CSS selector used as the business identity.
- Boundary: one SemanticNode may have several Anchors; an Anchor is not the
  referent itself.

## Selector

A serializable description of where selection evidence applies inside a Surface
or Anchor.

- Positive: viewport point, rectangular region, text quote plus position.
- Negative: a handler that performs a click.
- Boundary: a Selector locates evidence; it does not prove semantic identity.

## Selection

A time-bound record of a person's pointing, region, lasso, or text-selection
gesture, including its Surface revision.

- Positive: a pointer point recorded against `surfaceRevision: 12`.
- Negative: an agent choosing a tool argument without human UI input.
- Boundary: keyboard-created native text selection is a Selection even without a
  pointer event.

## ResolvedReferent

One application object selected by the deterministic resolver, accompanied by
authority, evidence, and freshness.

- Positive: `record/customer-42` supported by an authoritative row Anchor.
- Negative: the visible string “Customer 42” with no application mapping.
- Boundary: multiple SemanticNodes may resolve to one referent after `entityRef`
  deduplication.

## GroundingBundle

The complete resolution result for one Selection, including referents,
ambiguity, problems, and references to optional context or capabilities.

- Positive: a result containing two selected records and their evidence.
- Negative: an action request that updates those records.
- Boundary: an empty bundle may be valid when it carries an explicit problem;
  silent failure is not.

## ContextBundle

A minimal, authorized, budget-bounded projection of application data associated
with resolved referents.

- Positive: the selected record's permitted fields and freshness metadata.
- Negative: the entire Redux store or hidden tenant data.
- Boundary: omitted fields remain omitted even if a caller asks for a larger
  token budget.

## authority

The declared provenance class of a semantic claim. The initial ordering is
`authoritative`, `derived`, then `inferred`.

- Positive: an application registry assigns `authoritative` to its record ID.
- Negative: geometry overlap is silently upgraded to authoritative identity.
- Boundary: higher authority does not bypass staleness or permission checks.

## evidence

Inspectable facts used to include, score, order, or reject a candidate.

- Positive: point containment, visible ratio, anchor identity, and revisions.
- Negative: an unexplained numeric confidence score.
- Boundary: evidence explains resolution but is not authorization to act.

## revision

A monotonically increasing value that identifies semantic or adapter state used
for resolution.

- Positive: changing dashboard filters increments `semanticRevision`.
- Negative: wall-clock time used as a best-effort change indicator.
- Boundary: geometry movement may update adapter state without changing the
  underlying entity identity; the applicable revision still must be recorded.

## ambiguity

An explicit classification that the available authoritative evidence cannot
produce a single uncontroversial referent set.

- Positive: two equally ranked overlapping shapes that represent different
  entities.
- Negative: returning the first candidate and hiding the tie.
- Boundary: an intentional multi-selection is plural, not necessarily ambiguous.
