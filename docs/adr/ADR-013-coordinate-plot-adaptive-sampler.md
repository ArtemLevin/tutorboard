# ADR-013 — Coordinate plot adaptive sampler

## Status

Accepted for the coordinate-plot PR 3 increment.

## Context

`tutorboard-expression/1` provides deterministic finite-value evaluation, while
`BoardDocument 1.1` stores explicit and parametric series. A fixed numerical step
produces angular curves in high-curvature regions, wastes points on straight
regions and can bridge vertical asymptotes. Rendering concerns also must stay out
of core so the same geometry can be consumed by Konva, exports and a future Web
Worker.

## Decision

- Implement `tutorboard-sampler/1` as a pure synchronous TypeScript module in
  core.
- Compile series through the existing expression engine and isolate diagnostics
  per series.
- Refine intervals in screen space by midpoint chord error, segment length and,
  for parametric curves, turn angle and loop evidence.
- Treat undefined evaluations and asymptote-like jumps as curve breaks.
- Clip accepted edges to the local plot pixel rectangle before returning them.
- Return independent polyline segments in local plot coordinates.
- Enforce 12 refinement levels, 12,000 points and 50,000 evaluations per series,
  plus 80,000 points per coordinate-plane object.
- Support cooperative cancellation through a minimal read-only abort signal.
- Provide a bounded deterministic LRU cache keyed by formulas, parameters,
  viewport, pixel size, board zoom, options and sampler version.
- Keep sampled geometry transient. BoardDocument continues to persist only the
  source formulas and plot settings.
- Keep the sampler independent of React, Konva, DOM, storage, networking,
  clocks, randomness and dynamic-code APIs.

## Consequences

PR 4 can render already-clipped polyline segments without owning formula
execution or numerical refinement. Zoom changes naturally invalidate cached
geometry because screen-space tolerance depends on zoom. Invalid formulas,
domain gaps and one truncated series remain local to that series. The pure API
can move into a Web Worker later without changing BoardDocument or renderer
contracts.
