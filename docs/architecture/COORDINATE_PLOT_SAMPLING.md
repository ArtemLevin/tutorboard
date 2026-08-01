# Coordinate plot numerical sampling

TutorBoard converts compiled `tutorboard-expression/1` formulas into clipped
polyline fragments with the versioned numerical contract
`tutorboard-sampler/1`.

## Pipeline

```text
CoordinatePlotDefinition
  → compile each formula and finite domain/range expression
  → evaluate initial intervals
  → adaptive screen-space refinement
  → discontinuity classification
  → local-pixel clipping
  → bounded polyline segments
  → optional LRU cache
```

Expression and sampling errors are scoped to one series. Other visible series on
the same plane continue through the pipeline.

## Public API

```ts
sampleExplicitSeries(input)
sampleParametricSeries(input)
sampleCoordinatePlotDefinition(input)
createPlotSamplingCache(maximumEntries?)
plotDataToLocalPoint(point, viewport, pixelSize)
plotLocalToDataPoint(point, viewport, pixelSize)
clipPlotEdgeToPixelRect(start, end, pixelSize)
```

The low-level samplers accept opaque compiled expressions. The coordinate-plane
orchestrator compiles domain objects, evaluates parameter-dependent bounds,
handles visibility and diagnostics, applies the total point budget and reuses
cached geometry.

## Screen-space refinement

Every initial interval evaluates its start, midpoint and end. Explicit functions
split when the evaluated midpoint departs from the chord midpoint by more than
0.65 screen pixels or the chord is longer than the configured segment budget.
The same tests apply to parametric curves, together with turn-angle and
loop/cusp evidence.

Refinement runs left-to-right and stops at 12 levels. Repeated endpoint and
midpoint values are memoized inside one sampling operation. Increasing board
zoom increases effective screen-space error and therefore requests additional
detail.

## Discontinuities

Evaluator results classified as domain, division-by-zero or non-finite become
gaps. Mixed finite and gap intervals are bisected to localize the break. At the
leaf boundary, a large screen jump is rejected when midpoint evidence indicates
an asymptote or far-offscreen excursion. This prevents bridges across `1/x`,
`tan(x)` and similar functions while retaining steep finite lines.

The result shape is:

```ts
readonly segments: readonly (readonly Vec2[])[];
```

Every segment is an independent local-pixel polyline. Undefined regions and
rejected jumps flush the current segment.

## Clipping

Accepted edges are clipped with a bounded Liang–Barsky calculation to
`[0,width] × [0,height]`. The sampler returns only finite local points inside the
plot rectangle. PR 4 can still apply a Konva clip group as a defensive rendering
boundary.

## Limits

- adaptive depth: 12;
- points per series: 12,000;
- evaluations per series: 50,000;
- initial intervals: at most 128;
- points per coordinate plane: 80,000;
- cache entries: at most 64.

Caller-provided options can lower these limits. Higher values are clamped to the
contract maximums. Results report point count, evaluation count, refinement
count, breaks, clipped edges, undefined reasons and a stop reason.

## Cache

The numerical cache key includes formulas, domain or range expressions,
parameter values, coordinate viewport, local pixel size, board zoom, sampling
options and `tutorboard-sampler/1`. Visual line style and series labels are
excluded because they do not affect geometry. The cache is bounded LRU and never
stores an aborted result.

## Worker compatibility

The module uses immutable inputs and synchronous return values. It has no React,
Konva, DOM, storage, network, clock or random dependency. A later worker adapter
can serialize the existing request and result shapes without changing the core
API.
