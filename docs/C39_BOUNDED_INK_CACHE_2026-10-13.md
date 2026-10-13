# C3.9 — bounded contiguous ink run raster reuse (experimental)

Date: 2026-10-13. Repo `ArtemLevin/tutorboard`, Issue #201.
Immutable control main: `82baf7d86df0b2bbac4d89498484e385f2e5303b`.

## Root-cause hypothesis

The current `WheelInkCacheCoordinator` accepts only runs with
`minimumWheelCacheStrokes = 80`, rasterizes at DPR × viewport zoom,
and caps total raster allocations at `maximumWheelCachePixels = 4_000_000`.
`groupInkRenderRuns` previously accumulated *all consecutive strokes*
into one group. A very large group with an excessive bounding rectangle
cannot enter this cache; the wheel then re-renders all Konva vector and hit
shapes on every canvas repaint. Existing C3.9 traces showed Konva scene/hit
synchronous redraws ~55–115ms and Chromium LayerTreeHost layer updates
up to ~265ms in 10k + 10 static-media scenes. The cache hypothesis still
requires experimental verification; idle availability can also prevent
preparation, and single-group bounds can sometimes fit.

## Minimal controlled change

Split **only contiguous pen-only sequences** into groups of at most 128
objects, using a stable key from the first stroke in each group.
All child objects remain mounted with original IDs, listeners, coordinate
transforms and z-order. Non-ink runs and media layering remain unchanged.
The existing wheel raster memory budget, zoom-resolution guard, hit-canvas
rasterization, invalidation at content/selection changes and empty-cache
fallback are untouched.

The candidate increases Group count; this can cause additional React/Konva
work or memory. If performance is neutral/negative, keep Draft/NO-GO.

## Evidence gates

- Candidate must pass exact-head quality, Chromium+Firefox smoke, Smart Ink,
  media and collaboration checks, focused ink-run registration/order test.
- Independent Chromium DPR2 ABBA: three cycles per runner, same 5k/10k
  10-image mixed fixtures, fixed `82baf7d86df0b2bbac4d89498484e385f2e5303b` vs exact candidate SHA.
  GO requires >=20% median paired active-frame P95 on both scenes on each
  runner, no >100ms tail regression, and stable restored fixtures.
- Pixel-level before/after comparison, accurate pointer-hit selection and
  eraser, pen, undo/redo, reconnect and GC/memory soak remain independent
  release requirements. Avoid declaring GO on green workflow alone.

## Strict screenshot and hit parity for ABBA

Both arms run the same E2E reporter, over their separately built immutable
application revisions; only the control reporter test file is overlaid.
Before wheel and after the captured active frames, Playwright creates DPR2
PNG screenshots of the board stage and SHA256 hashes. The comparator requires
exactly matching hashes within and across paired runs. After the timed input,
Playwright clicks a pen stroke below the image row with the real selection
tool; exactly one selected hit is required. Missing or mismatching hashes
or hit counts fail the benchmark regardless of P95 improvements.
