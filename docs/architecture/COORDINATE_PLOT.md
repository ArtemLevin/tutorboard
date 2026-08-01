# Coordinate plot domain model

TutorBoard stores one coordinate plane as one `math.coordinate-plot` board object. The object owns a bounded list of explicit and parametric series, shared numeric parameters, coordinate viewport settings, axes, grid and legend configuration.

## Versioning

BoardDocument 1.1 introduces the object. Readers migrate 0.1, 0.2 and 1.0 documents into 1.1 without changing existing board content. Formula strings are stored with `tutorboard-expression/1`; compiled expressions, sampled geometry, equal-scale expansion and selected-series state remain transient. Generated document, command-envelope, snapshot and geometry-import fixtures exercise the 1.1 boundary, while the dedicated 1.0 fixture remains available for migration tests. Board command envelopes and recovery snapshots use the same 1.1 transport boundary; evidence and collaboration protocols keep their independent 1.0 versions.

## Multi-series contract

A plane may hold up to 32 independent series. Each series has a stable local identifier, name, visibility flag and visual style. Explicit series store `y=f(x)` plus optional domain expressions. Parametric series store `x=f(t)`, `y=g(t)` and a finite-expression range. Local identifiers remain stable when the whole plane is copied.

## Editing and collaboration

`core.coordinate-plot.update` replaces the definition while preserving board identity and transforms. The command carries an expected snapshot, allowing the reducer to reject stale collaborative edits. Locked objects and members of locked groups remain protected. Collaborative undo swaps the command's expected and replacement definitions, so one accepted edit has one deterministic inverse.

## Rendering boundary

PR 4 replaces the safe placeholder with a production `CoordinatePlotRenderer` registered through `KonvaRendererRegistry`. The renderer applies the board object's transform, resolves equal unit scale transiently, consumes clipped local-pixel polylines from `tutorboard-sampler/1`, and draws the background, minor grid, major grid, axes, labels, multiple styled series, selection overlay, frame and legend.

Each sampled fragment becomes one independent Konva `Line`, preserving domain gaps and asymptotes. Series support solid, dashed and dash-dot strokes, opacity and width. A wider hit area makes thin curves selectable; selected or hovered series receive a halo while unrelated series are visually de-emphasized. Legend rows use the same selection contract. The component supports controlled selection props for the PR 5 editor and keeps local selection transient by default.

Automatic major grid steps follow `1, 2, 5 × 10ⁿ` with a target interval near 80 screen pixels. Minor lines subdivide one major interval into five parts. Tick formatting removes negative zero, limits decimal noise and uses scientific notation for very large or very small values. Axes and labels remain inside the clipping rectangle near viewport edges.

## Expression engine

PR 2 provides the pure TypeScript `tutorboard-expression/1` tokenizer, Pratt parser, contextual compiler and budgeted evaluator. It supports explicit and parametric variables, shared parameters, school-style implicit multiplication, Unicode notation, structured source-span diagnostics and controlled undefined results. Compiled expressions are opaque and transient. The module has no React, Konva, DOM, storage, networking or dynamic-code dependency.

Expression compilation remains outside BoardDocument validation. A malformed series can therefore be reopened and corrected while the document, unrelated objects and sibling series remain available. The complete grammar and limits are specified in `COORDINATE_PLOT_EXPRESSION_LANGUAGE.md`; ADR-012 records the security and dependency decision.

## Numerical sampler

PR 3 provides `tutorboard-sampler/1` for explicit functions and parametric curves. It adaptively refines intervals in screen space, memoizes repeated evaluations, breaks undefined and asymptote-like intervals, clips accepted edges into the local plot rectangle and returns independent polyline segments. The coordinate-plane orchestrator compiles parameter-dependent domains and ranges, isolates invalid series, enforces per-series and per-plane budgets and supports a bounded deterministic LRU cache.

The production renderer reuses one bounded cache across plot instances. Effective sampling zoom includes board zoom and object scale, so visual enlargement requests suitable detail and produces a distinct cache key. Aborted results are never cached. The full numerical algorithm and result contract are specified in `COORDINATE_PLOT_SAMPLING.md`; ADR-013 records the worker-compatibility decision. ADR-014 records the Konva rendering and selection decisions.

## Selection and clipboard

Marquee and lasso use the transformed rectangular object extent. The generic clipboard remaps only the global board object identifier and position; internal series and parameter identifiers remain local to the copied plane. Lifecycle tests cover a copied plane containing explicit and parametric series plus a shared parameter.

Series selection belongs to the renderer/editor interaction layer and therefore does not change BoardDocument, clipboard payloads or collaborative command history. PR 5 can own the controlled selected-series value while reusing the same visual component.

## Transfer compatibility

SVG and PNG board snapshots retain their existing deterministic contract. The production Konva renderer affects the interactive canvas and does not change BoardDocument or transfer schemas. A future snapshot renderer can consume the same sampler output and grid helpers without introducing formula execution into serialization.

## Release verification

The release gate checks schema migration, nested domain limits, stale-safe updates, collaborative undo, Board sync transport, clipboard identity preservation, transformed marquee and lasso selection, renderer registration, expression grammar, contextual variables, evaluation domains, adaptive explicit and parametric sampling, discontinuity splitting, clipping, automatic grid steps, equal-scale resolution, line styles, legend placement, sampled render geometry, cache behavior, contract freshness, browser smoke, production image hardening and security scanning.
