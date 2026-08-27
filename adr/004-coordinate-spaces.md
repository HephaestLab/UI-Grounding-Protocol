# ADR-004: Coordinate spaces are explicit

- Status: Accepted
- Date: 2026-08-27

## Decision

Selectors and Anchors declare coordinate space and transformations. CSS viewport
coordinates are the DOM boundary format. Canvas and SVG adapters may use local
coordinates but must provide a deterministic transform and account for clipping
and device pixel ratio.

## Consequences

Geometry helpers never infer a coordinate space from numeric shape alone.
