# C3.9-S4 — Konva scene/hit causal investigation

Date: 2026-10-11. Follow-up to [Issue #201](https://github.com/ArtemLevin/tutorboard/issues/201) and the independent A1 **NO-GO** recorded in PR #217.

## Root-cause candidates verified by code inspection

1. `BoardStage.tsx` renders immutable committed visible items in a Konva content `Layer` under a `Group` whose scale/offset changes for every wheel input. Konva redraws the layer's scene and hit canvases when the group transform changes.
2. The existing visibility index calculates object bounds up front and compares visible membership/order, but the static `BoardSceneContent` still maps contiguous pen runs into Konva nodes. Batches of 250 objects are a React grouping mechanism; they are not independent spatial canvas regions.
3. `partitionCommittedPaintRuns` primarily segregates animated GIF runs. For static-only 3k–10k+ten-image scenarios it retains a single committed content layer. The layer is a full-viewport invalidation region.
4. Scene and hit render costs are recorded separately by existing opt-in `konva-scene` and `konva-hit` draw wrappers. A1's inconsistent ABBA result means scene identity churn alone did not reliably improve user-perceived active p95. Scene/hit drawing, viewport persist, compositing and workload scheduling remain competing causes.

These findings are architectural possibilities, **not a measured claim that canvas redraw dominates**.

## Instrumentation-only S4 experiment

- New `tests/e2e/c39-scene-hit-causal.ts`: frame-clipped **union of overlapping JavaScript draw intervals** to avoid double-counting nested spans; distinct scene, hit and persistence summaries, per-slow-frame observations. rAF gaps remain the end-to-end signal. No attribution of GPU/compositor work to JS draw durations.
- Existing `tests/e2e/c39-large-board-profile.spec.ts` emits optional `C39_SCENE_HIT_CAUSAL` alongside existing static-heavy output when `C39_SCENE_HIT_CAUSAL=1`. Production rendering code, hit testing, documents and media are unchanged.
- Dedicated GitHub Actions workflow: 2 independent runners × 2 full repeats × 4 real static-heavy scenes, 18 native wheel inputs per scene, same browser contexts/DPR2/fixtures as the existing profile. Preserve raw report artifacts.
- Unit tests cover interval clipping, overlapping scene/hit/persist calls, slow frames, and the bounded tile-memory estimator.

### Bounded tile feasibility — research calculation only

For a 1240×820 CSS-pixel viewport with DPR2, tiling into 256 CSS-pixel cells requires 20 cells. The optimistic resident area is **4,067,200 scene pixels** and 1,016,800 hit pixels at hit ratio 1. Even without padding, overscan, scratch or GPU copies, the scene pixels **exceed the existing 4,000,000 physical-pixel WheelInkCache ceiling**. With one scratch scene+hit tile, the minimum estimated RGBA surfaces occupy 21,646,720 bytes (~20.6 MiB), before additional allocations.

Therefore do **not** turn on a full-viewport DPR2 tile cache under the current shared budget. A viable next candidate must use partial/visible dirty-tile residency, limited run regions, explicit eviction and the shared WheelInkCache budget; measure net costs instead of assuming tiling is faster.

### Required correctness before any production tile candidate

- Respect original z-order barriers: ink–image–ink stays in order, including alpha and transformed groups; do not lift all handwriting into a top layer.
- Clip unique tile interiors after padded geometry sampling, with no seams or duplicated semi-transparent edge blending.
- Preserve per-object hit IDs and hover/selection/eraser/transform behavior during wheel and immediately after commit/cancel.
- Dirty-region invalidation on old ∪ new bounds for pen edits, style, erase, group transforms, undo/redo and collaboration updates.
- Enforce total scene+hit+temporary+existing-wheel resources, DPR1/2, max allocation, lifetime/cancel/clear/reopen checks. Fall back to existing vector layer when quota or correctness limits prevent caching.
- Hold production merges until matched A/B shows ≥20% active p95 improvement on both 5k and 10k, >100ms rates fall, and pixel/hit/input/memory/lifecycle checks are green.

## Decision gate

After observing both S4 runner logs, compare active slow-frame windows with scene/hit JavaScript intervals and persistence, across scenarios and runner variance. If strong scene/hit overlap is reproducible, prototype **one bounded contiguous ink-run region** on a separate branch with pixel/hit parity as the primary acceptance gate. If not, prioritize the dominant measured persist/React/compositor pathway. No scene tiles are shipped by this research PR.

The stable `main` is intentionally untouched; #201 remains open.
