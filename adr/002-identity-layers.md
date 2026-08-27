# ADR-002: Keep instance, anchor, and business identity separate

- Status: Accepted
- Date: 2026-08-27

## Decision

`surfaceId`, `nodeId`, `anchorId`, `entityRef`, `selectionId`, and `groundingId`
have distinct roles. A Node may have many Anchors and many Nodes may share one
`entityRef`. DOM indexes, CSS selectors, row indexes, and visible labels cannot
serve as stable business identity.

## Consequences

Virtualized and multi-view UIs remain stable across recycling and rendering
changes, while resolution can deduplicate views without erasing evidence.
