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

## Verified two-runner results and gate decision — 11 October 2026

### Exact evidence and checks

- Instrumented source HEAD: `86d9c7ee772ade0bc642f98be60a683a977024c7` from stable main `8a24b882b2a84472bc530691e47171a7775e74a6`. Test environment recorded the same synthetic PR-merge SHA `59b2af3575e67d5ea7f64ad200839104b505e17c` for all 16 browser scenarios. No production draw/hit/cache logic was changed.
- [Independent Chromium research run #38116778080](https://github.com/ArtemLevin/tutorboard/actions/runs/38116778080): 2 runners × 2 repeats × 4 scenarios (3k, 5k, 10k dense; 10k offscreen), DPR2, 4 PNG + 6 JPEG, 18 wheel inputs each. Both jobs passed; raw event JSON and logs archived as `c39-s4-scene-hit-*` artifacts.
- All 16 CDP clock correlations were `aligned`, max reported absolute anchor drift **0.145 ms**, CDP overflow **0**; bounded JS event counts were between 356 and 540, below the 12,000-event cap.
- [Full PR CI #38116778024](https://github.com/ArtemLevin/tutorboard/actions/runs/38116778024) passed: quality/unit/performance/format/lint/typecheck/build, Chromium/Firefox smoke, GeometryOS, coordinate plot, media profile, board-only profile and production image. Static-heavy and E2 companion workflows on this source also succeeded.

### Aggregated cost attribution

**Method:** add *frame-clipped union* of positive-duration `konva-scene` and `konva-hit` JavaScript events within active wheel-frame windows and divide by the sum of active rAF frame intervals. Persistence is a separate interval union. `slowWithSceneHit` and `slowWithPersist` are counts of >100ms gaps temporally overlapping any matching interval; categories can coincide. These are observed synchronous JS intervals, **not GPU time, exclusive causal fraction, or potential p95 uplift**.

| Fixture | Active frame gaps | >100ms frames | Scene JS | Hit JS | Scene∪hit JS / active gap | Persist JS / active gap | Slow overlap scene/hit | Slow overlap persist |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 3k + 10 static | 305 | 74 | 1,717.2ms | 1,400.1ms | 3,117.3 / 24,182.3ms = **12.9%** | 2,797.0ms = **11.6%** | 71/74 | 26/74 |
| 5k + 10 static | 303 | 114 | 2,540.4ms | 2,284.0ms | 4,824.4 / 30,982.2ms = **15.6%** | 3,870.6ms = **12.5%** | 90/114 | 29/114 |
| 10k + 10 static | 337 | 184 | 4,774.9ms | 4,849.8ms | 9,624.7 / 55,697.6ms = **17.3%** | 9,257.9ms = **16.6%** | 129/184 | 49/184 |
| 10k offscreen | 245 | 26 | 646.5ms | 552.4ms | 1,198.9 / 11,132.8ms = **10.8%** | 2,052.4ms = **18.4%** | 18/26 | 10/26 |

The four *individual* 10k dense scene+hit fractions were 15.5%, 13.7%, 20.0%, 19.0%; corresponding viewport persist fractions were 16.8%, 17.4%, 16.2%, 16.2%. Scene/hit cost is substantial and repeatable even as the host-specific p95 varies.

**Distinct tail signatures:** one 10k frame lasted ~583.3ms with **192.0ms** scene+hit and zero overlapping persist; a different 10k frame lasted ~549.9ms with **513.6ms** persist and zero scene/hit. The offscreen scenario had >100ms frames in only one of four repeats (26), coincident with 2,052.4ms total persist; the other three repeats had zero >100ms frames. This directly cautions against treating all wheel stalls as a scene-redraw problem.

### Decision: limited prototype GO; full tile/production NO-GO

**GO to one research prototype** of a *bounded spatially isolated contiguous pen-only render run*, on its own branch against stable main, with an opt-in feature switch/fallback. The 5k–10k workloads reproducibly incur 15–20% active-frame wall-clock occupancy in scene/hit JS; hit drawing is as expensive as scene drawing for the 10k case. This is enough to justify one isolated experiment, **but it is not evidence that tile caching improves p95**, particularly given 16.6% concurrent-class persist cost and unexplained compositor/event-loop portions.

**NO-GO for full-viewport tiling, skipping hit rendering, or a production merge.** The exact estimated DPR2 viewport cache exceeds the current 4M scene-pixel budget even before scratch/overscan. Enforce bounded total scene+hit+scratch+wheel cache memory and exact existing hit ownership. Do not disable Konva hit layers or reorder pen/image/pen strata merely to accelerate a benchmark.

### Next engineering block / exit criteria

1. Implement only a single, contiguous, z-order-preserving pen run with bounded partial dirty tiles (and explicit eviction), or an equivalent restricted spatial clip. Preserve vector fallback for unsupported transforms, mixed alpha, limits, or non-stable runs. Restrict the scope to wheel viewport changes; preserve existing pen, eraser, selection, undo/redo, GIF and permission lifecycles.
2. Add **pixel equivalence** DPR1/2 on pen/image overlap and tile edges (including nonopaque stroke, group transforms), precise object hit/drag/eraser immediately before/during/after wheel, and resource cleanup/restore/repeated wheel regression.
3. Conduct paired **A0/A2** Chromium ABBA on the same 3k/5k/10k/offscreen real-media documents and two independent runners. Collect per-run active p50/p95/p99/max, >100ms rate, scene/hit/persist intervals, pen input-to-paint and memory. A successful renderer optimization requires ≥20% reproducible active p95 reduction on both 5k/10k and falling >100ms rates, with no meaningful 3k/offscreen, pixel/hit or memory regressions.
4. If A2 reduces draw JS time but leaves end-to-end active p95 unchanged, classify A2 NO-GO and redirect to persisting viewport intermediate updates, GPU/compositor and frame scheduler analysis **without weakening input/schema validation**.

This document is the decision record for the measurement-only S4 PR. Leave [Issue #201](https://github.com/ArtemLevin/tutorboard/issues/201) open and [PR #218](https://github.com/ArtemLevin/tutorboard/pull/218) Draft; hold main steady.
