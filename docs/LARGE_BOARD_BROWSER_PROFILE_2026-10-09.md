# Large-board browser performance baseline — 09.10.2026

## Evidence and scope

- Repository: ArtemLevin/tutorboard. Pull request: https://github.com/ArtemLevin/tutorboard/pull/192.
- Measured feature SHA: 8d5240a35a5891ac6aeb7873029e52ab7e481838.
- GitHub Actions CI: https://github.com/ArtemLevin/tutorboard/actions/runs/37890197582. Media performance profile job succeeded: 12/12 Chromium cases, including all four new large-scene tests.
- Environment: one GitHub-hosted Chromium runner, production-built frontend. Single-run evidence; no assertion of platform-independent FPS.

Workload: canonical Vector Ink (300 or 600 strokes), six different deterministic 1536×1536 PNGs (54 MiB full-resolution RGBA source pixel equivalent; approximately 2.22 MiB embedded compressed data), optionally four animated GIF fixtures. PNGs display at 140×140 board units and use the existing adaptive bitmap decode pathway. Four independent factorial scenarios separate ink density and GIF presence.

After UI import and active raster decode, the real board was tested through 48 display frames of idle, physical Playwright pen pointer movements and wheel zoom. Browser instrumentation recorded RAF intervals, Canvas drawImage/clearRect, Long Tasks; BoardStage exposed Wet Ink input-to-paint p95 and raster cache diagnostics. The gesture wall-clock intervals also contain Playwright scheduling and measurement time, and are not direct input latency.

## Chromium measurements

All timing columns are milliseconds, p95 denotes the observed 95th percentile of sampled intervals.

| Scenario | Import/decode elapsed | Idle frame p95 | Drawing frame p95 | Input-to-paint p95 | Zoom frame p95 | Zoom maximum | Zoom drawImage calls |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 300 strokes, 0 GIF | 789.6 | 16.7 | 33.4 | 16.8 | 16.7 | 33.4 | 36 |
| 300 strokes, 4 GIF | 799.4 | 16.7 | 33.3 | 21.9 | 33.4 | 50.0 | 510 |
| 600 strokes, 0 GIF | 1014.9 | 16.8 | 33.3 | 16.2 | 33.3 | 33.4 | 36 |
| 600 strokes, 4 GIF | 960.3 | 33.4 | 33.4 | 30.9 | 66.7 | 66.7 | 540 |

In the drawing phase, static-only scenarios had zero Canvas drawImage calls, versus 200 for 300 strokes + 4 GIF, and 330 for 600 strokes + 4 GIF. In the zoom phase, four GIFs raised drawImage calls from 36 to 510/540.

The measured retained decoded raster working set was 1–1.5 MiB in these samples, despite 54 MiB of original RGBA source pixels, because display-aware raster buckets reduced retained bitmap resolution. This is a raster cache diagnostic, not browser total memory; transient decode buffers and image decoding are outside that measure. No PerformanceObserver Long Tasks of 50 ms or more were observed in these sampled phases, despite some RAF gaps of 50–66.7 ms. RAF gaps and Long Task events are distinct signals.

## Root-cause hypothesis and limits

The strongest next target is animation-driven invalidation of the committed Konva content Layer. Four GIFs share the animation coordinator, but their redraws still paint the same Layer that owns immutable strokes and nearby static media. Both independent factors matter: without GIFs, doubling strokes increased zoom p95 from 16.7 to 33.3 ms; adding GIFs at 600 strokes doubled zoom p95 again to 66.7 ms. These measurements justify profiling ordered static paint caching and selective invalidation. They do not establish which renderer operation or GPU stage consumes every millisecond.

Do not change object stacking order, board hit testing, selection or transform semantics to create an animation overlay. Do not impose a universal reduced GIF playback frame rate without measured trade-offs. Do not change persistence or authentication boundaries in this performance step.

## Next block C3.2 (implementation acceptance)

1. Trace Konva Layer and nested Group painting under GIF animation and wheel/pen input, including selection and plots.
2. Benchmark an ordered-run or bounded static cache approach on the same 2×2 fixture; preserve per-object z-order, rendering and all hit/selection invariants.
3. Apply only the smallest confirmed optimization, with focused regression tests of GIF+strokes+zoom, group transforms, clear/undo, scene changes and disposal.
4. Repeat Chromium before/after profiling and Firefox smoke plus full CI. Publish measured improvements and residual costs.

Limitations: local offline BoardDocument import was profiled here; the authenticated media.asset network path, multiple simultaneous guest inputs, browser/device diversity, very high zoom, memory fragmentation and prolonged sessions were not part of this run. F3.3.2-D separately covers lifecycle/revoke and 12-cycle memory resource release.

## C3.2-A — wheel-aware GIF frame pacing candidate

Candidate PR #193 uses the existing transient 24-fps GIF repaint pacing
during a wheel zoom session, and restores regular cadence immediately on
wheel commit/cancel, on authoritative viewport resynchronization, and on
cleanup. Original object z-order and the single committed Konva Layer are
unchanged. This is a repaint *volume* optimization; it does not cache
static paths or prevent the committed Layer from repainting.

Measured candidate feature SHA: 305d88ccb8ef75aee34a31165b64265eeec0079a,
CI run https://github.com/ArtemLevin/tutorboard/actions/runs/37896592812.
All 12 Chromium media profile tests passed, as did Chromium/Firefox smoke.

| Scenario | Baseline zoom frame p95 | Candidate zoom frame p95 | Baseline zoom drawImage | Candidate zoom drawImage |
| --- | ---: | ---: | ---: | ---: |
| 300 pen, 0 GIF | 16.7 ms | 16.8 ms | 36 | 36 |
| 300 pen, 4 GIF | 33.4 ms | 33.4 ms | 510 | 370 |
| 600 pen, 0 GIF | 33.3 ms | 33.4 ms | 36 | 36 |
| 600 pen, 4 GIF | 66.7 ms | 66.7 ms | 540 | 460 |

Canvas drawImage workload fell approximately 27.5% for 300 pen + 4 GIF
and 14.8% for 600 pen + 4 GIF. **There is no demonstrated improvement in
zoom frame-gap p95**: the candidate leaves the 600 pen + GIF stall intact.
The values come from one CI runner sample per code version, so percentage
changes are descriptive, not confidence intervals or cross-device guarantees.

The existing dynamic redraw throttle is already used during active pen
input. C3.2-A reuses that mechanism strictly for a wheel gesture; default GIF
cadence resumes on session completion and the browser smoke asserts it
continues animating after wheel zoom.

Follow-up C3.2-B remains necessary: an animation-aware static-content
composition strategy that avoids repainting unchanged committed paths
while preserving arbitrary z-order, hit-testing and visual semantics.
That is a distinct change requiring before/after zoom p95 and rendered
pixel checks on mixed/interleaved GIF and static content.
