# ICE-02B — world bounds and spatial broad-phase foundation

**Status:** experimental Draft, pending exact-head CI, correctness/performance
profiling and independent review. Depends on [ICE-02A](ICE2_SCENE_DELTA_FOUNDATION.md)
and sequential integration [#323](https://github.com/ArtemLevin/tutorboard/pull/323).

## Scope

Add a pure, renderer-neutral `BoardSceneSpatialIndex` on certified
`BoardSceneReadModel` snapshots, plus `deriveSceneDirtyBounds(delta)`.
No production renderer, persisted `BoardDocument`, collaboration protocol,
undo/redo implementation, media decode, Konva hit-test or input handling changes.

- World-space AABBs reuse the **same** geometry and transform pipeline as
  the shipping `selectVisibleBoardItems` reference. The bounds are
  conservative *broad-phase envelopes*. Exact hit-test and partial-eraser
  intersection remain the responsibility of the existing narrow phase.
- A bounded 512-world-unit uniform grid indexes up to **64 cells per item**.
  Very large/nonfinite items use a conservative overflow list, never unbounded
  per-object bucket expansion. Queries spanning over 4,096 cells fall back
  to scanning retained entries.
- Queries return candidate `BoardRenderItem` references in authoritative
  `BoardDocument.order` order and respect `visible` and the existing
  viewport overscan definition. No z-layer permutations.
- SceneDelta `patch` replaces only changed records in the bucket map.
  Unexpected order or surviving immutable identity changes cause a full
  rebuild. `reset` reconstructs from the authoritative next scene.
  `camera`/`noop` preserve the index when item identities are stable.
- Each dirty item carries its previous and next world envelope.
  `reset` or unknown geometry marks full invalidation; callers must
  discard transient caches or use a known-correct vector fallback.
  Camera-only transforms are signalled separately by `viewportChanged`.
- `dispose()` drops all object, bucket, overflow and ordering references.

## Safety limitations

These envelopes intentionally match the existing culling selector. They are
**not a newly certified exact world geometry kernel** for arbitrary pressure
brushes, text glyphs, transformed imported SVG, clipping, groups or
GeometryOS visual overrides. In particular, no consumer may crop geometry or
infer a precise eraser/hit answer from these AABBs alone. Unsupported
content stays on Konva; every new hit/erase broad phase needs an independent
full precision/narrow-phase regression.

The grid has a finite per-item footprint, while the overflow list is
scanned conservatively. This prevents huge zooms/strokes from allocating
millions of cells. The index itself still has O(number of visible objects)
ownership and a validation scan in `apply`; gains must be benchmarked
against the shipping `createBoardVisibilityIndex` before enabling it.

## Acceptance tests and follow-up

- Unit: viewport and z-order equivalence with `selectVisibleBoardItems`,
  one-object movement and old/new dirty regions, tail additions, camera-only,
  reorder reset, large-object overflow, repeated replacement and disposal.
- Existing CI: full Chromium/Firefox smoke, core/GeometryOS/coordinate
  integration, Paddle security, C3.9 baselines, 240 Hz pen and GIF wheel A/B
  stay unchanged and mandatory.
- Next ICE-02B tasks: transformed groups and GeometryOS regression fixtures,
  strict spatial-index query A/B under 5k/10k scenes, remote/import/undo
  lifecycle, exact new-vs-old bounds comparison, no stale refs after clear,
  and bounded allocation / p95 instrumentation.
- **GO for production use requires** reference equivalence and actual
  measured CPU/allocation benefit with no hit/erase or memory regression.
  Otherwise record NO-GO and leave the module inert.

This stage is intentionally reversible and import-free in the production
renderer. It does not assert completion of the full ICE-02B exit gate.
