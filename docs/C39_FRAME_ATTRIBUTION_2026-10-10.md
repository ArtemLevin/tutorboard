# C3.9-B · Per-frame input/React/Konva/Chromium attribution

Date: 2026-10-10 · [issue #201](https://github.com/ArtemLevin/tutorboard/issues/201)

## Objective and known reproduction

[C3.9-A](https://github.com/ArtemLevin/tutorboard/pull/204) is merged in `main`
(`f8602825f8301b2f959c90dd3078bb05dd7a872f`).
Two independent Chromium full-matrix runs reproduced, on the *representative*
fixture, active zoom p95 about **150 ms** on 3000 cold mixed DPR2 and **250 ms**
on 5000 cold mixed DPR2; 3000 warm dense also had an observed end-of-gesture
gap of **216.7 ms**. These measurements do not establish the root cause.

## C3.9-B implementation

* The existing browser-only `__tutorBoardC37Trace` recorder is extended with
  `wheel-input`, `wheel-commit`, `wheel-cancel` and `wheel-layout` events.
  The normal code path has only a cheap recorder-presence guard; the existing
  bounded recorder retains at most 12,000 events.
* The wheel event contains numeric session ID, input delta and resulting zoom;
  the layout event includes visible item count, committed and animated Layer
  count. Commit records the synchronous `onViewportCommit` duration; the
  original `board-commit` event describes wheel dispatch until React layout,
  **not** React CPU exclusively. `konva-scene`, `konva-hit`, GIF invalidation
  and React render runs retain their existing semantics.
* `tests/e2e/c39-frame-attribution.ts` runs Chromium CDP `Tracing` for
  the demanding representative scenes, retaining *timestamp/duration*,
  process/thread IDs and trace event name/category. A 20,000-event cap is
  applied, with an explicit dropped-event count. The browser recorder captures
  fixed `performance.mark` and `console.timeStamp` clock anchors inside
  the same trace. Chrome timestamps are in microseconds on a different clock:
  missing/drifted anchors result in `traceAlignment: unavailable`;
  GPU/compositor availability is **never represented as zero cost**.
* `correlateC39SlowFrames` reports the five largest rAF gaps >50 ms,
  the closest preceding wheel input, overlapping browser JS events,
  and overlapping Chrome compositor/raster events when clocks align.
  Classifications are **coincident observations**, not causal diagnosis;
  overlapping thread durations must not be summed.
* New `tests/unit/core/c39-frame-attribution.test.ts` verifies browser
  clock alignment, unavailable GPU evidence, clock drift and top-five selection.
  Profiles remain synthetic: do not save or export student-authored documents
  or content. Both recorders are only enabled by the isolated browser tests.

## Gates

Run normal `npm run check`, unit regressions, Chromium media profile, extended
`npm run e2e:c39-profile` with archived JSON results and GitHub Actions release
gates. Key release criterion: for the 3000/5000 representative reproductions,
the report contains five (or fewer when insufficient gaps) timestamped slow
frame windows with overlapping JavaScript and, when possible, Chromium events.
Missing markers/threads are explicit diagnostics. Verify instrumented profile
overhead against the C3.9-A profile: trace-on timing is **not** by itself an
evidence of a performance regression or improvement.

## Next block — C3.9-C

Investigate the precise critical path with controlled factor experiments, fresh
browser runs, alternate z-order and cache states. If trace alignment is
unavailable, refine clock-sync instrumentation before claiming a GPU source.
Production performance remains an **open issue** until a measured fix and soak.
