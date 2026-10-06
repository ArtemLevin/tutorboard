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


## Active stroke latency follow-up — 06.10.2026

PR #175 removed committed-scene renderer work from transient drawing updates,
but a separate current-stroke feedback loop remained. The active pen path still
performed one immutable sample-history copy per accepted coalesced point,
published local pen state through React during motion, and rebuilt the full Wet
Ink stroke geometry on every animation frame. Under main-thread pressure a
missed frame could therefore accumulate a larger coalesced batch, making the
next frame more expensive and producing the observed delayed catch-up stroke.

Draft PR #176 (`perf/active-stroke-latency`) changes that path as follows:

- `reduceDrawingInteractionBatch` accepts the frame's pointer samples and
  appends accepted pen samples with at most one history-array copy per batch;
- the local pen/Smart Ink preview is owned by imperative Wet Ink during the
  gesture, while shapes/text retain their declarative React preview;
- collaboration ink uses imperative start/update/end/cancel deltas and does not
  depend on per-move React state publication;
- Wet Ink receives only newly painted samples, seals old geometry into immutable
  Konva paths, and recomputes a bounded mutable tail;
- dash/dash-dot/wavy/sketch transient rendering carries distance phase across
  sealed chunks; the canonical persisted/final renderer keeps its previous
  contract;
- clear/destroy redraws use Konva batch scheduling, while the active paint is
  owned by one Wet Ink animation-frame callback;
- BoardStage exposes backlog, batch-size, mutable-tail, generated-geometry,
  input-to-paint latency and frame-gap diagnostics for browser regression gates.

Regression coverage includes a 20,000-moving-sample reducer benchmark,
production-like Konva 120/240 Hz runs, a 64-sample burst, reducer equivalence,
Wet Ink sealing/tail bounds, collaboration delta/cancel semantics and an
`@smoke` browser scenario that supplies synthetic `getCoalescedEvents()`
batches.

Verified production code-head:
`67c78ce7b1eeb7ef1213d7f43873522f4e28b0bc`.

CI run `37466497150` verified:

- format, lint, strict typecheck and dependency threshold;
- 181/181 unit/integration test files and 990/990 tests;
- 10/10 performance files and 18/18 tests; the new active-stroke suite passed
  3/3 in 613 ms on the CI runner;
- architecture boundaries and production build;
- Chromium browser smoke: 28/28 passed;
- Firefox browser smoke: 28/28 passed;
- Board-only frontend profile, GeometryOS live browser contract and Coordinate
  Plot production gate.

Smart Ink, Formula Recognition and Paddle formula sidecar gates also completed
successfully for the same production code line. The remaining C3 risks continue
to be GIF repaint cost, large-raster decode/memory and embedded-byte persistence
amplification; this active-stroke block does not alter their ownership or data
contracts.


## Main-thread latency hardening follow-up — 06.10.2026

After the active-stroke pipeline itself became incremental in PR #176, profiling
review focused on work that still competed for the same browser main-thread
budget during writing.

Three concrete costs were confirmed in the current code:

1. `WetInkLatencyTracker.record()` called `snapshot()` on every Wet Ink frame,
   which copied and sorted the rolling latency window to compute p95.
2. `BoardStage` wrote the complete Wet Ink diagnostic dataset to the DOM on
   every rendered frame.
3. The board-scoped GIF coordinator correctly deduplicated RAF ownership but
   still called `Layer.batchDraw()` every animation frame while pen input was
   active.

Stacked PR #177 (`perf/main-thread-latency-hardening`) changes those paths
without changing document, media or collaboration contracts:

- p95 refresh is amortized to at most once per 500 ms while exact snapshots
  remain available on demand;
- BoardStage publishes frame diagnostics at most once per 500 ms and flushes the
  latest report when Wet Ink clears, so browser tests retain final evidence;
- GIF repaint cadence is capped at 24 fps only while Wet Ink interaction is
  active; normal cadence resumes immediately after finish/cancel and after page
  visibility resumes;
- the existing coalesced 240 Hz-equivalent browser regression records Long Task
  entries where the browser supports them, bounds stall evidence, and verifies
  that diagnostic DOM publication is substantially lower than the Wet Ink frame
  count.

Unit regressions cover interaction-aware GIF redraw cadence, immediate resume,
visibility lifecycle and amortized percentile refresh. The browser test degrades
gracefully on engines that do not expose the `longtask` PerformanceObserver
entry type.

Verified code-head:
`91469e822dd84e3732073c153cbe1382942558c5`.

CI run `37473332612` verified:

- format, lint, strict typecheck and dependency threshold;
- 181/181 unit/integration files and 992/992 tests;
- 10/10 performance files and 18/18 tests;
- active-stroke performance suite 3/3 in 832 ms on that shared CI run;
- architecture boundaries and production build;
- Chromium browser smoke: 28/28 passed;
- Firefox browser smoke: 28/28 passed;
- Board-only frontend profile, GeometryOS live browser contract and Coordinate
  Plot production gate.

Smart Ink, Formula Recognition and Paddle formula sidecar gates also completed
successfully on the same code-head.

The next strongest main-thread candidate is full-document serialization and
hashing. Local persistence synchronously validates, canonicalizes and
`JSON.stringify()`s the complete BoardDocument before IndexedDB work begins;
server sync also canonical-serializes the full document before SHA-256
verification. Those operations can still create input/render stalls on large
documents or documents with embedded media and should be profiled next before
selecting a Worker/off-main-thread design. Large raster decode/memory and
asset-backed media persistence remain separate C3 work.


## Off-main-thread document computation follow-up — 06.10.2026

The next confirmed main-thread candidate after PR #177 was full-document
canonical serialization and hashing. Before this block, local persistence called
`serializeBoardDocument()` synchronously before entering the IndexedDB
transaction. That path performs validation, recursive canonicalization/key
ordering and `JSON.stringify()` over the complete BoardDocument. Current-schema
server sync also canonical-serialized the complete document before SHA-256
verification.

PR #178 (`perf/off-main-thread-document-computation`) introduces a core
`BoardDocumentComputation` port and a lazy module Worker adapter:

- background autosave starts Worker serialization during the debounce window;
- normal Dexie saves consume the prepared async serialization result;
- pagehide and SPA workspace disposal retain synchronous lifecycle serialization
  so the durable repository path starts before the lifecycle handler returns;
- when a background save is already waiting for Worker serialization, lifecycle
  flush synchronously promotes the same operation ID through the repository.
  Dexie checks duplicate operation identity before optimistic revision conflict,
  so concurrent background/lifecycle completion stays idempotent;
- current-schema BoardSyncEngine hashing and evidence verification run through
  the Worker-backed hasher;
- current-schema hashes are reused inside recovery/apply flows instead of being
  recomputed for an equivalent transport digest;
- Worker creation is lazy and Worker crashes/unavailability fall back to the
  previous inline implementation;
- each React StrictMode sync setup owns its Worker instance and disposes only
  that instance during cleanup;
- legacy BoardDocument 1.4/1.5 compatibility digest projections remain on the
  existing migration/recovery path in this block.

The persisted BoardDocument representation, revision IDs, operation IDs,
undo/redo, collaboration ordering, authorization boundaries, media bytes and
public data contracts are unchanged.

### Verification

Verified production code-head:
`ecf35fce19d6d81871853477926ac4e15b4cd5a4`.

CI run `37482601624` verified:

- format, lint, strict typecheck and production dependency threshold;
- 182/182 unit/integration test files and 1000/1000 tests;
- 10/10 performance files and 18/18 tests;
- architecture boundaries and production build;
- Chromium browser smoke: 28/28 passed;
- Firefox browser smoke: 28/28 passed;
- GeometryOS live browser contract, Board-only frontend profile and Coordinate
  Plot production gate.

Smart Ink, Formula Recognition and Paddle formula sidecar gates also completed
successfully on the same code-head.

New regression coverage explicitly guards:

- Worker prewarm reuse;
- lifecycle synchronous serialization fallback;
- Worker SHA and inline fallback on Worker failure;
- Dexie background-vs-lifecycle computation selection;
- autosave prewarm;
- pagehide promotion of an already in-flight background save;
- SPA dispose promotion of an already in-flight background save;
- BoardSyncEngine use of the injected async hasher.

### Remaining C3 work

This block removes current-schema full-document canonical serialization/SHA work
from the ordinary browser main-thread path while preserving lifecycle durability.
The strongest remaining C3 candidates are large-raster decode/memory pressure,
asset-backed media persistence to stop embedded-byte revision amplification, and
representative browser profiling with multiple large real-world JPEG/PNG assets.

Legacy 1.4/1.5 compatibility projections still run inline during migration or
recovery. They are intentionally outside the hot current-schema path and should
only move to the Worker after profiling shows material cost.
