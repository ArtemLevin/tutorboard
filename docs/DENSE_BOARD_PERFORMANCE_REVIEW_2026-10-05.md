# Dense board performance: 05.10.2026

## Scope and acceptance contract

User goal: keep writing responsive as committed pen strokes and embedded images
accumulate. Investigation baseline: `main` at
`f3be4030ede7f81f2f10a2e18aa3c075fcebd601`.

This is a focused canvas-adapter bugfix with async lifecycle review. Affected
owner: `adapters/canvas-konva`. Enforced boundaries: `ARCH-001`, `ARCH-002` and
`CANVAS-007` in `scripts/architecture-rules.mjs`. `PLAN.md` currently describes
these boundaries by name rather than maintaining a matching numeric catalog.

Acceptance criteria:

- 500 unchanged committed objects are rendered once across 20 transient updates;
- edits, zoom, selection movement, group transforms and object removal remain live;
- drawing over 300 pen strokes and 10 static images does not repaint committed
  rasters during the gesture;
- eight mounted GIFs share one application callback per animation frame and
  request at most one redraw per unique Layer;
- hidden-page, clear, unmount and StrictMode cleanup cannot resurrect stale
  callbacks; undo restores animation;
- original document order, object IDs, hit targets and coordinate ownership stay
  intact; the existing six Stage Layers are retained;
- BoardDocument 1.6, command/snapshot protocols, original embedded bytes,
  persistence revisions, recovery and undo semantics remain compatible.

No dependency, stored format, media-size limit, network, authorization or
production deployment change is part of this block. No external media fetching
or new HTML/SVG interpretation is introduced.

## Confirmed causes

### Committed geometry was rebuilt during transient updates

`BoardDrawingController.moveBatch` updates runtime drawing state. App/BoardCanvas
rerender, then BoardStage synchronously maps every visible committed item through
`registry.render`. The scene selector already preserves unchanged item identity,
but that identity did not prevent renderer execution. Pen rendering rebuilds
centerlines and filled outlines; Konva may also receive fresh path/point props.

An equivalent extracted scene with the original eager execution produced 10,500
renderer calls for 500 objects and 20 updates (500 initial + 20 × 500). The
regression guard failed before memoization and passes with 500 total calls after
memoization.

`tests/performance/dense-scene-rendering.test.ts` uses 500 real pen objects with
32 pressure/time samples each, the real default renderer, two warm-up passes and
five measured passes. Canvas host components are replaced in this CPU benchmark;
the domain geometry and registry are real.

| CPU step | Median, local isolated run |
| --- | ---: |
| Original per-update registry mapping | 60.55 ms |
| Stable committed-scene update | 0.113 ms |

These measurements exclude browser canvas painting and do not claim a measured
end-to-end FPS improvement. Exact renderer reuse is the primary regression gate;
a 250 ms CPU-update ceiling supplies broad CI headroom over local samples.

### Preview changes repainted committed images and strokes

Committed objects and runtime previews occupied the same content Layer. Adding
or changing a preview invalidated that Layer, so Konva repainted all of its
visible images and pen paths. The separate Wet Ink surface did not eliminate
this extra content-Layer work.

Runtime previews now occupy the existing transient Wet Ink Layer. Its imperative
surface owns a separate sibling Group and clears/destroys only that Group's
resources. Preview ordering stays above committed content and below selection
overlays; no additional full-viewport canvas is allocated.

`tests/e2e/dense-board-rendering.spec.ts` gates zero committed PNG `drawImage`
calls during active writing, then verifies materialization and undo.

### GIF scheduler work grew with mounted image count

C3.0 PR [#174](https://github.com/ArtemLevin/tutorboard/pull/174), final code head
`f56852e8950fff69cbbe4b010377f9ccf3edaf98`, contains instrumentation only. Its
production renderer is identical to the reviewed main baseline. CI
[#2045](https://github.com/ArtemLevin/tutorboard/actions/runs/37236564597), job
`111537330657`, provides the browser evidence:

| Scenario | App/Konva callbacks over approximately 60 frames | Raster drawImage calls |
| --- | ---: | ---: |
| 1 GIF | 124 | 62 |
| 4 GIF | 305 | 244 |
| 8 GIF | 549 | 488 |
| 5 static images + 4 GIF + pen + plot | 330 | 660 |
| 10 static images, idle | 0 | 0 |

Each GIF previously scheduled its own loop. Konva already coalesced actual Layer
draws, so reducing callbacks alone cannot eliminate repainting of unrelated
content caused by GIF animation.

A board-scoped coordinator now deduplicates redraw requests by the current Layer
and services committed and preview GIFs with one scheduler. It pauses explicitly
on visibility changes, cancels on last release, and uses an epoch to reject stale
callbacks across hide/resume and disposal/remount. It owns no decoded images or
stored data. Unit tests require exactly 60 application callbacks and 60 redraw
requests for eight GIFs over 60 simulated frames. The browser guard allows at
most 140 total app/Konva callbacks over 60 frames, including boundary headroom.

## Implementation and review

- `board-scene-content.tsx`: memoized committed scene and individual render item
  views; unchanged renderer work is skipped, while item/context/zoom changes are
  propagated. Selection deltas are scalar props, and plot interaction context is
  routed only to plots.
- `BoardStage.tsx`: owns the animation coordinator and places transient previews
  alongside the owned Wet Ink Group; the adapter still consumes only scene read
  models and emits intents.
- `animated-image-redraw.ts` and its private React context: one scheduler per
  board, current-Layer deduplication, visibility and cancellation lifecycle.
- `embedded-image-renderer.tsx`: registers mounted GIFs with the board runtime;
  the existing load/error/unmount and original `dataUrl` behavior is retained.
- Regression coverage includes renderer reuse, changed content/zoom, order,
  group transforms, removal, duplicate subscriptions, Layer changes, hidden
  registration, stale callbacks and StrictMode disposal/remount. Browser smoke
  adds dense writing and GIF clear/undo; a core validator checks the browser
  fixture's canonical Vector Ink.

Concurrency review: each registration owns a separate token; repeated cleanup
cannot remove another registration. No global scheduler is created at module
initialization. After disposal the same coordinator can accept a fresh React
effect lifecycle, while the previous epoch and tokens remain invalid. No document
mutation, persistence writer, command batch, collaboration ordering, coordinate
conversion or source-of-truth boundary changes.

## Remaining work and limits

1. **GIF repaint cost remains proportional to visible content complexity.**
   Original z-order is preserved in the content Layer. Profile dense ink/plots
   with 1/4/8 GIF after this fix, then evaluate bounded static Group caching or
   z-order-preserving render runs. A single top GIF overlay would change document
   order and is unsuitable.
2. **Large raster decode/memory is not bounded by an application cache.** Source
   pixels are decoded as before. C3.0 reports one 57 ms mount-time Long Task for
   its high-pixel case. Its 1×1 image fixtures and one 1024×1024 image do not
   establish a real large-photo memory budget. Next evidence must use multiple
   large JPEG/PNG files, display scale/zoom, viewport churn and decoded-pixel
   accounting before cache/downscale limits are selected.
3. **Embedded-byte persistence amplification remains.** Local C3.0 serialization
   measurements with 256 KiB base64 payload per image were 1.06 / 3.91 / 7.44 ms
   for 1 / 5 / 10 images. Six actual Dexie saves of five images retained 7,883,718
   serialized bytes; the entire payload is stored in each revision. Larger
   photographic payloads and more ink require their own representative browser
   save/command profile. ADR-032 owns asset-backed storage and migration/recovery
   design. Retention, undo or embedded bytes must not be silently discarded.

Clearing a board deliberately preserves undo/history and clipboard under B3.
That behavior is independent from cancellation of transient animation/render
resources. This block fixes the confirmed live-writing path and scheduler
overhead; it does not close all C3 decode/storage work or claim arbitrary board
size is cost-free.

## Verification record

- Focused canvas adapter suite: 64 tests passed before the additional group
  transform regression; that regression passed in the full suite.
- Focused real-geometry CPU benchmark: passed; the isolated measurements are
  recorded above.
- Full `npm run check`: passed — GeometryOS and board contract checks,
  format/lint/typecheck, 987 unit/integration/node tests in 181 files, 14
  performance tests in nine files, architecture boundaries and production build.
  The later browser-harness-only synchronization changes receive fresh lint and
  typecheck; they do not change production code.
- Browser test discovery: all four Chromium/Firefox cases discovered.
- Local browser execution is blocked by unavailable browser executables; the
  Playwright download returned a non-ZIP response. Chromium/Firefox smoke must
  be verified in CI before this branch is considered ready to merge.
- Self-review checked scene identity invalidation, hit-target ownership, original
  z-order, independent preview/Wet Ink Group cleanup, cancellation epochs and
  unchanged storage/auth/collaboration boundaries. No blocking code finding
  remains; browser execution is an explicit release-gate gap.
