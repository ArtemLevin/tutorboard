# ADR-014 — Coordinate plot production Konva renderer

## Status

Accepted for the coordinate-plot PR 4 increment.

## Context

`BoardDocument 1.1` stores coordinate-plot definitions, while
`tutorboard-expression/1` and `tutorboard-sampler/1` already provide safe formula
execution and clipped local-pixel polylines. The existing placeholder renderer
shows only a frame, approximate grid and legend text. A production renderer must
preserve TutorBoard object transforms, render multiple styled series, remain
responsive during board zoom and provide a line-selection affordance for the PR 5
editor.

## Decision

- Replace the placeholder with a dedicated `CoordinatePlotRenderer` registered
  for `math.coordinate-plot`.
- Keep formula compilation and numerical refinement in core. The renderer consumes
  `tutorboard-sampler/1` results and never implements its own evaluator.
- Resolve `equalScale` transiently by expanding one viewport axis around its
  center. Persisted coordinate bounds remain unchanged.
- Derive automatic major grid steps from `1, 2, 5 × 10ⁿ` with an approximately
  80-pixel target interval. Minor grid lines subdivide one major interval into
  five parts.
- Render the plot inside a Konva clipping group. Draw minor grid, major grid,
  axes, tick labels, axis labels and sampled series in that order.
- Render every sampled fragment as its own `Line`, preserving discontinuities
  emitted by the sampler.
- Support solid, dashed and dash-dot series styles, per-series opacity and stroke
  width.
- Keep selected-series state transient and component-local by default. Expose
  controlled selection props so the PR 5 editor can own the state later.
- Use a wider transparent hit area and a visual halo for line selection. Legend
  rows select the same series.
- Reuse one bounded sampler cache across renderer instances. Cache keys already
  include formulas, parameters, viewport, pixel size, effective zoom and sampler
  version.
- Keep renderer helper functions pure and test automatic steps, equal-scale
  resolution, labels, legend placement and sampled render geometry separately
  from React/Konva event state.

## Consequences

Coordinate plots now participate in the normal Konva scene with production
visuals while preserving the existing BoardDocument and core boundaries. Board
zoom and object scale request suitable sampling detail. Invalid or truncated
series remain isolated and receive compact legend or plot warnings. PR 5 can add
formula editors, internal pan/zoom and persistent editor selection through the
controlled renderer props without changing the numerical contracts.
