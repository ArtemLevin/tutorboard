# C3.9 — primary workload: many pen strokes and ten static images

Date: 2026-10-10. [Issue #201](https://github.com/ArtemLevin/tutorboard/issues/201).

## Updated user priority

The primary production case is a teacher's board with **many thousands of pen strokes and approximately ten static photographs or illustrations** in PNG, JPG and JPEG formats. Animated GIFs are rare. Treat GIF layering/performance as a *secondary regression requirement*.

The previous E2 Chromium result already provides a minimal reference:
3,000 varied strokes (800 visible), 10 large PNG, DPR2, active-wheel median-run p95 **41.75 ms** and >100 ms gap rate **0.5%** across 217 active frames, four runs. This result alone cannot establish performance with ten thousand pen strokes or mixed JPEG decoding.

## Representative static-heavy gate, first implementation block

Opt-in `C39_STATIC_HEAVY_PROFILE=1` adds four dedicated scenarios to
`tests/e2e/c39-large-board-profile.spec.ts`. The original seven C3.9
scenes and eight E2 scenes are unchanged by default.

| Scenario | Pen strokes | Visible pen strokes requested | Images | DPR |
| --- | ---: | ---: | --- | ---: |
| static-3000-10-images | 3,000 | 2,400 | 4 PNG + 6 JPEG | 2 |
| static-5000-10-images | 5,000 | 4,000 | 4 PNG + 6 JPEG | 2 |
| static-10000-10-images | 10,000 | 8,000 | 4 PNG + 6 JPEG | 2 |
| static-10000-offscreen | 10,000 | 1,000 | 4 PNG + 6 JPEG | 2 |

The JPEGs are real browser-encoded 1,536×1,536 photographs-like synthetic
raster patterns, split evenly between `.jpg` and `.jpeg` filenames
with `image/jpeg` MIME; PNGs are 1,536×1,536 and `image/png`.
All ten media objects appear on the board in the same stacking-order
pattern. No GIFs or animated-layer activity. JPEG encoding and PNG
construction occur **before measurement**.

The 18-wheel-event rAF sampler reports active/commit/settling latency,
max/p95/p99, >100ms gap frequency, import duration, core viewport command
trace, Chromium compositor LayerTree/DrawFrame attribution and wheel ink
cache diagnostics. Strict fixture and source SHA checks reject missing or
misclassified media or changed object counts. The new dedicated workflow
runs **three independent repetitions** on one GitHub runner and archives
complete traces. Results with fewer than 200 active frames are clearly
marked **insufficient** for a broad p99/tail acceptance claim; p95 results
remain descriptive until replicated.

This is a diagnostic benchmark, **not yet a new pass/fail browser SLA**.
The exact target hardware and acceptable peak frame latency should be
decided using real teacher usage and independent replication. A first
objective is to eliminate noticeable stalls (>100 ms) without losing
pixel quality, storage integrity, hit testing or collaboration.

## Subsequent engineering steps (work ordered by evidence)

1. Establish the static 3k/5k/10k trajectory above; if stable, expand
   to 20k strokes and multiple file sizes/resolutions and add memory and
   loading/clear/reopen behavior.
2. Identify whether the largest measured cause is strict input validation
   of `core.viewport.set`, O(N) viewport visibility/filtering, Konva
   scene/hit rasterization, cache invalidation, React reconciliation,
   bitmap decode or compositor costs. Measure them separately in a
   like-for-like A/B case.
3. Make the smallest safe change with observable regression coverage.
   Preserve the untrusted-data Zod boundary, original strokes and
   hit regions, persisted schema, z-order, undo/redo, security and
   teacher/guest real-time sync. Do not globally reduce image quality,
   silently drop offscreen objects or raise GPU memory bounds.
4. Follow with DPR1/2 browser pixel equivalence; freehand draw/erase,
   selection, undo/redo, pan/zoom; PNG/JPG/JPEG import; document
   clear/reopen, repeated interaction, memory/resource cleanup,
   controlled pilot and soak (C3.9-F).
5. Keep existing GIF checks as secondary regression protection.

This priority **supersedes the GIF-first C3.9-E3 suggestion** in the
2026-10-10 E2 historical report. That report remains factual historical
evidence, not a current implementation directive.
