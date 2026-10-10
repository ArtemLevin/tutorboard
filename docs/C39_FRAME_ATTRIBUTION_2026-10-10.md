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
  count. Commit records synchronous duration and separate diagnostic
  `wheel-cache-end`, `wheel-animation-resume`, and `wheel-viewport-persist`
  substeps. The original `board-commit` event describes input through React layout,
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

## Verified first run and wheel commit hypothesis

[Full representative Chromium run 38037268498](https://github.com/ArtemLevin/tutorboard/actions/runs/38037268498)
completed **7/7** on the initial formatted PR head `47e84b535a267c5395c3e729c3ad1afa0d2b875b`.
Clock synchronization succeeded in the 3000/5000-stroke Chromium profiles;
start/end marker drift was under 0.13 ms, and no heavy-case compositor events
were dropped by the bounded recorder. Light cases without CDP tracing
explicitly returned `traceAlignment: unavailable`.

| Scenario | Representative rAF gap | Coincident critical-path candidates |
| --- | ---: | --- |
| 3000 cold, DPR2 | 133.3 ms | wheel commit ~140–146 ms; DirectRenderer draw ~34–50 ms |
| 3000 warm dense, DPR1 | 183.3 ms | wheel commit ~123 ms; Konva scene ~21 ms; LayerTreeHost update ~25 ms |
| 3000 mostly offscreen, DPR2 | 99.9–116.6 ms | wheel commit ~126 ms in one frame; LayerTreeHost update ~98 ms in another |
| 5000 cold, DPR2 | 233–250 ms | wheel commit ~180–221 ms; LayerTreeHost update ~50–54 ms |

These are **overlapping** observations, not additive CPU/GPU costs.
The newly added substep markers distinguish cache teardown, GIF reactivation
and synchronous viewport persistence so C3.9-C can isolate the actual
critical path. A final CI run is required on the substep-marked SHA.
Trace-on timings must not be presented as uninstrumented speed benchmarks.

## Firefox cross-browser release-gate regression (2026-10-10)

[Post-merge CI 38038788541](https://github.com/ArtemLevin/tutorboard/actions/runs/38038788541)
ran the complete E2E suite on Firefox (unlike PRs which run `@smoke` only),
then failed four 3000–5000-stroke C3.9 scenarios because the compositor
recorder unconditionally invoked Chromium-only `browserContext.newCDPSession`.
This did **not** indicate a board runtime failure.

The C3.9 browser harness now uses CDP only when the browser type is
`chromium` (`browser.browserType().name() === "chromium"`).
Firefox continues collecting wheel input, rAF gaps and JS
renderer events, with compositor evidence explicitly `unavailable`.
A representative 3000-stroke mixed-media case carries `@smoke` and runs
in both browsers on pull requests, so this mismatch is caught before merge.
No production renderer or document protocol is changed by this gate repair.
