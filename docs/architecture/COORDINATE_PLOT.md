# Coordinate plot domain model

TutorBoard stores one coordinate plane as one `math.coordinate-plot` board object. The object owns a bounded list of explicit and parametric series, shared numeric parameters, coordinate viewport settings, axes, grid and legend configuration.

## Versioning

BoardDocument 1.1 introduces the object. Readers migrate 0.1, 0.2 and 1.0 documents into 1.1 without changing existing board content. Formula strings are stored with `tutorboard-expression/1`; parsing and numerical evaluation belong to later modules. Generated document, command-envelope, snapshot and geometry-import fixtures exercise the 1.1 boundary, while the dedicated 1.0 fixture remains available for migration tests. Board command envelopes and recovery snapshots use the same 1.1 transport boundary; evidence and collaboration protocols keep their independent 1.0 versions.

## Multi-series contract

A plane may hold up to 32 independent series. Each series has a stable local identifier, name, visibility flag and visual style. Explicit series store `y=f(x)` plus optional domain expressions. Parametric series store `x=f(t)`, `y=g(t)` and a finite-expression range. Local identifiers remain stable when the whole plane is copied.

## Editing and collaboration

`core.coordinate-plot.update` replaces the definition while preserving board identity and transforms. The command carries an expected snapshot, allowing the reducer to reject stale collaborative edits. Locked objects and members of locked groups remain protected. Collaborative undo swaps the command's expected and replacement definitions, so one accepted edit has one deterministic inverse.

## Rendering boundary

PR 1 provides a safe placeholder renderer with axes, a lightweight grid and a legend. The renderer never evaluates expressions. The parser, adaptive sampler and production curve renderer are separate follow-up modules.

## Selection and clipboard

Marquee and lasso use the transformed rectangular object extent. The generic clipboard remaps only the global board object identifier and position; internal series and parameter identifiers remain local to the copied plane. Lifecycle tests cover a copied plane containing explicit and parametric series plus a shared parameter.

## Transfer compatibility

SVG and PNG board snapshots include the coordinate-plane frame and axes without evaluating stored formulas. This keeps document export deterministic during the domain-model stage and provides a stable placeholder until the numerical renderer is introduced.

## Release verification

The release gate checks schema migration, nested domain limits, stale-safe updates, collaborative undo, Board sync transport, clipboard identity preservation, transformed marquee and lasso selection, renderer registration, contract freshness, browser smoke, production image hardening and security scanning.
