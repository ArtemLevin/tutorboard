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


## C3.2-B — ordered static/GIF Konva Layers: measured candidate

Candidate branch: `perf/c3-2-static-animated-render-runs`, draft
[PR #194](https://github.com/ArtemLevin/tutorboard/pull/194).
Measured code SHA: `0f9fdf21773a7bed0da3d4037a8bc8285a5ec4a1`.
[Chromium CI and media profile](https://github.com/ArtemLevin/tutorboard/actions/runs/37905777675),
two successful media-profile job attempts with the same source. All 12 media
profile cases passed in each attempt. Chromium and Firefox `@smoke` passed,
including the five-layer interleaved GIF/PNG fixture. The code SHA also
passed Prettier, ESLint, TypeScript, unit tests, performance budget, source
boundaries, production build, authenticated asset cache, 12-cycle resource
soak and both full-stack media upload browsers.

The original C3.1 baseline came from SHA
`8d5240a35a5891ac6aeb7873029e52ab7e481838`,
[CI 37890197582](https://github.com/ArtemLevin/tutorboard/actions/runs/37890197582),
first media-profile job plus rerun. Both baseline and candidate are exercised
by identical Chromium scenes with 300/600 strokes, six 1536² PNG sources,
0/4 GIFs and 48 measured rAF frame gaps per interaction. Samples reflect
CI-host scheduling variability, not a browser- or device-wide confidence
interval.

| Scenario | Baseline zoom p95 (2) | C3.2-B zoom p95 (2) | Baseline zoom drawImage (2) | C3.2-B zoom drawImage (2) |
| --- | --- | --- | --- | --- |
| 300 pen, 0 GIF | 16.7 / 16.8 ms | 33.3 / 16.8 ms | 36 / 36 | 36 / 36 |
| 300 pen, 4 GIF | 33.4 / 16.7 ms | 33.4 / 33.4 ms | 510 / 530 | 232 / 238 |
| 600 pen, 0 GIF | 33.3 / 16.8 ms | 33.4 / 33.3 ms | 36 / 36 | 36 / 36 |
| 600 pen, 4 GIF | 66.7 / 49.9 ms | 66.6 / 50.0 ms | 540 / 540 | 250 / 250 |

For 600 strokes with GIFs, `drawImage` dropped by ~53.7% in both repeat
samples. Pen input-to-paint p95 was 30.9/32.7 ms in baseline and 15.4/13.0 ms
in the candidate; this improvement also repeats in this two-sample evidence.
These results support isolation of GIF-triggered static-image repaints and a
reduction in competing animation work during pen gestures.

**The wheel zoom p95 release criterion remains unmet:** baseline
49.9–66.7 ms and candidate 50.0–66.6 ms overlap almost perfectly.
During wheel zoom, the viewport transform still invalidates the otherwise
static Layers, so the heavy-board zoom stall is not demonstrated fixed.
Do not represent the lower image count as a stable zoom FPS gain.

Implementation limits the number of full-viewport Konva Layers to six and
falls back to the original shared Layer if animation/static objects are too
interleaved. Existing React renderers, stacking order, hit areas, transforms,
media access scope and cleanup are retained. Unmeasured high-DPI canvas
memory, pixel-level equivalence in complicated transformed/alpha overlaps,
and prolonged multi-user input remain open review items. Prior to merge,
either demonstrate sustained wheel zoom p95 improvement with a bounded
static zoom cache/viewport strategy, or explicitly accept C3.2-B as a
narrower but measured drawing-work and pen-latency optimization.
