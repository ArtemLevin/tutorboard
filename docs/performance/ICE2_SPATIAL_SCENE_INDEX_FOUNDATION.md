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
  to scanning retained entries. Dense queries and small scenes also use an
  ordered scan; sparse queries visit direct entry references, deduplicate
  matching entries, and sort only those matches.
- Queries return candidate `BoardRenderItem` references in authoritative
  `BoardDocument.order` order and respect `visible` and the existing
  viewport overscan definition. Identical results reuse the previous array;
  patch/rebuild/dispose clears that reference. No z-layer permutations.
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

## Remediation experiment — 2026-11-25

The first single-pass rectangular microprofile showed inconsistent results at
5k versus 10k. It was not sufficient to choose a production strategy.

- The new `ICE2_SPATIAL_ABBA` test uses 48 deterministic pan/zoom views on
  spread and dense rectangle layouts at both 5,000 and 10,000 items, verifies
  exact reference/order parity for each view, warms both algorithms six times,
  then executes ten alternating ABBA/BAAB blocks (20 samples per algorithm).
  It reports raw samples, nearest-rank p50/p95 and max for the whole sequence,
  candidate-result counts and index stats. These are diagnostic CPU sequence
  timings, not browser frame percentiles or a two-runner acceptance gate.
- The experimental adaptive crossover scans directly for at most 256 entries,
  oversized/invalid query cell ranges, or when the sum of bucket membership
  visits plus overflow reaches one quarter of indexed entries. This conservative
  heuristic is deliberately uncalibrated. It must be evaluated on independent
  runs before changing any production path. Direct bucket entry references avoid
  per-candidate ID lookups; the extra ordered entry array costs O(N) references.
- Regression fixtures exercise sparse/dense results, repeated result identity,
  tail deletion/restore and clear/dispose, group transforms and GeometryOS
  visual-transform/style overrides with old/new numerical bounds. The latter
  is a synthetic read-model fixture, not a canonical GIR or browser rendering
  test. Real media, pressure strokes, hit/erase and remote transport lifecycle
  remain open, along with measured retained heap and allocation profiles.

The original performance checks and rollout gates remain in force. No speedup
claim, production renderer wiring or ICE-03 GO follows from these changes alone.
