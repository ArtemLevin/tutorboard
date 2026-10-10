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


## C3.2-B wheel-zoom ink cache: repeated measurement

Runtime candidate: `6be6728d049b509327164b92d025b2b5c0faabb1`
on [PR #194](https://github.com/ArtemLevin/tutorboard/pull/194).
[Chromium media-profile CI](https://github.com/ArtemLevin/tutorboard/actions/runs/37922497775),
original media-profile job and its successful rerun, same code SHA.
Both attempts: 12/12 media-profile tests passed. Full quality gate and
Chromium/Firefox `@smoke` passed, including the transient wheel-cache lifecycle.
The post-zoom pen hit-test regression in the next commit still requires CI.

The cache rasterizes only consecutive immutable pen-stroke runs when their
count reaches 80; it is transient, limited to four million physical scene
pixels across all such runs, and disposed on gesture completion, edit,
selection preview, authoritative viewport replacement and unmount. GIFs,
static media and active geometry widgets stay on their original render path.
Pen-stroke geometry is independent of zoom, so the committed React renderer
receives a fixed zoom for that kind. Selection, render-run ordering and
Konva hit color keys remain present.

### Matched workload: 600 strokes, six PNGs, four GIFs

| Metric | Previous C3.2-B (2 samples) | With wheel ink cache (2 samples) |
| --- | --- | --- |
| Wheel zoom rAF p95 | 66.6 / 50.0 ms | **33.5 / 33.4 ms** |
| Wheel zoom rAF mean | 28.82 / 25.35 ms | 23.61 / 25.70 ms |
| Zoom `drawImage` count | 250 / 250 | 258 / 258 |
| Pen input-to-paint p95 | 15.4 / 13.0 ms | 15.4 / 17.7 ms |

### Control scenarios, zoom p95

| Scenario | With cache, first / repeated |
| --- | --- |
| 300 pen, no GIF | 33.3 / 33.3 ms |
| 300 pen, four GIFs | 33.4 / 33.4 ms |
| 600 pen, no GIF | 33.3 / 33.4 ms |
| 600 pen, four GIFs | **33.5 / 33.4 ms** |

The reduction in the heavy animated case repeats in both paired candidate
measurements, unlike the previous fluctuating wheel-zoom p95 profile.
Cached vector ink draws as a bitmap, so `drawImage` rises slightly:
it is not an indicator of a regression without considering path work.
At 600 strokes, the large-board wheel p95 fell below the previous 50–67 ms
range, but still exceeds a stable 16.7 ms 60-fps frame budget.

The benchmark is diagnostic: each profile uses 48 rAF intervals, runs on
shared GitHub CI hardware and exercises one Chromium browser/OS setup.
This supports a measured reduction for the representative workload; it
does not prove hardware-independent latency, long-term stability or exact
visual equivalence for every mixed alpha/transform combination. Retain a
bounded cache/fallback and instrument representative production boards.


### Release gate addendum — subsequent CI runs (same implementation)

The final code SHA `027378ef9aca3f20f9f4dbb391f8ffffbc96c57b`
added a post-wheel pen hit-test regression and synchronized documentation.
Its [CI run](https://github.com/ArtemLevin/tutorboard/actions/runs/37923496708)
completed with successful format/lint/typecheck/unit/performance-budget/build,
36 Chromium and 36 Firefox smoke tests, 12 Chromium media-profile tests and
all applicable integration and resource workflows. This includes the
new post-cache pen selection check, complementing the repeated layer- and
media-lifecycle checks.

The same media-profile job was rerun with unchanged commit SHA and passed
all 12 scenarios. The last two `large600-animated` profiles were:
- First final-code job: zoom p95 **50.0 ms**, mean **23.61 ms**, `drawImage` **262**, pen input-to-paint p95 **15.4 ms**.
- Rerun final-code job: zoom p95 **16.7 ms**, mean **16.67 ms**, `drawImage` **262**, pen input-to-paint p95 **13.7 ms**.

All four with-cache samples, including two preceding code-equivalent profiles
(`6be6728`, with its additional post-wheel regression subsequently added),
are **33.5, 33.4, 50.0, 16.7 ms**. Previous C3.2-B without wheel ink cache:
**66.6, 50.0 ms**. Baseline C3.1: **66.7, 49.9 ms**.
These are diagnostic shared-runner observations with significant variability.
The change lowers the heavy-scene observed zoom p95 in most runs while
remaining above 16.7 ms in three of four; it must not be represented as a
general 60-fps guarantee. Short-lived pixel-bounded caching, full CI and
cross-browser regression support accepting this performance improvement
for merging PR #194, with further profiling tracked independently.

## C3.2-A integration on top of merged C3.2-B

PR #193's interaction-aware GIF scheduling is ported onto the merged C3.2-B
static/GIF Layers and bounded wheel-ink cache. The 24-fps GIF redraw ceiling
applies only while a wheel session is in progress; full-rate GIF repaint
resumes on commit, cancel, authoritative viewport reset and unmount.
Cross-browser GIF resume smoke and dense-board Chromium profile must pass
before this combined candidate can be merged. Prior C3.2-A-only profiling
reduced redraw calls without a reproducible zoom p95 gain; CI evidence for
the integrated candidate must be evaluated separately.


## Post-merge C3.2-A + C3.2-B: confirmed main baseline

The actual `main` HEAD on 09.10.2026 is
`2f81af565ecafbe716531b8de1cca72956378650`, with
C3.2-B merged as `acc1342cd2d820dbd34cd02b9ab01b3193cdd8ec`.
The post-merge [CI run 37934870233](https://github.com/ArtemLevin/tutorboard/actions/runs/37934870233)
completed successfully (Quality gate, Chromium/Firefox smoke, media
performance profile 12/12, production image, associated production gates).

In its large600-animated test (600 ink strokes, 6 PNG, 4 GIF):
wheel zoom frame p95 **16.8 ms**, max **33.3 ms**, mean **17.01 ms**,
**218** Canvas `drawImage` calls, input-to-paint p95 **14.0 ms**.
The run still contains at least one missed 60-fps frame. This successful
single shared-runner sample is not evidence of consistently low p95 on
other machines or long sessions; prior runs ranged widely.

### C3.3 diagnostic follow-up (draft PR #195)

The wheel-start code synchronously calls `WheelInkCacheCoordinator.begin()`
before updating the React preview viewport. Konva then redraws the
transformed committed runs, with GIF repaint pacing reduced during the
wheel gesture. Existing evidence did not apportion long frame gaps
between wheel-cache construction, synchronous Canvas painting,
compositor/GPU latency and browser/runner scheduling.

[Draft PR #195](https://github.com/ArtemLevin/tutorboard/pull/195)
adds measurements for build duration, cache pixels and skipped runs;
Canvas `drawImage`, `clearRect`, `stroke` synchronous call time;
and rAF gaps over 25 ms / 50 ms. These are diagnostic-only metrics.
Canvas API synchronous duration excludes asynchronous compositor/GPU work;
instrumentation itself can perturb small frame budgets. Repeat comparable
scenarios before proposing another optimization or changing release budgets.


## C3.3 + C3.4 verification — 09.10.2026

PR #195 (diagnostics) merged as `190906383329f8f5dc17df9c5a5dce30e7ed92b1`.
Post-merge main CI [37962493241](https://github.com/ArtemLevin/tutorboard/actions/runs/37962493241)
passed Quality, browser smoke, media profile, associated gates and production
image. In the diagnostic run preceding C3.4, wheel cache construction cost
21–31 ms synchronously at 300–600 strokes.

PR #196 (idle prewarm) retains the 4M physical scene-pixel budget, exact
bounded DPR match, cold synchronous fallback, 15 s idle-cache expiry and
scene/gesture/unmount invalidation. [CI 37963878160](https://github.com/ArtemLevin/tutorboard/actions/runs/37963878160)
passed 1092 unit/integration tests, 24 performance tests, 38 Chromium and
38 Firefox smoke tests and 16 Chromium media-profile scenarios. The media
profile was independently rerun on the same SHA and again passed 16/16.

### Repeated large-scene measurements

Each p95 comes from 48 rAF intervals on a shared Linux Chromium CI runner.
The sixth scenario has 3,000 document strokes, of which the renderer's
visible-item selection may draw a smaller subset. Media: 6 large PNG and
4 GIF in all animated scenarios.

| Scene | First / repeated zoom p95 | First / repeated max gap | Prepared cache use |
| --- | --- | --- | --- |
| 300 static | 16.7 / 16.8 ms | 16.8 / 33.4 ms | both |
| 300 + GIF | 16.8 / 33.4 ms | 33.3 / 33.5 ms | yes / no |
| 600 static | 16.8 / 16.8 ms | 33.3 / 33.4 ms | both |
| 600 + GIF | 16.8 / 33.3 ms | 33.4 / 50.0 ms | both |
| 1000 + GIF | 16.8 / 33.4 ms | 50.1 / 50.0 ms | both |
| 3000 + GIF | 33.4 / 33.4 ms | 83.3 / 116.6 ms | both |

When prewarm succeeded, measured synchronous first-wheel `begin()` cost
was near zero; the cold 300 + GIF rerun needed 11.6 ms. Mixed
pixel-equivalence comparisons on DPR 2 across two independent Chromium
contexts were identical on both runs: 2480×1640 pixels, 0.99284% of
channels different by more than 3 levels, mean absolute channel
difference 0.176. Thresholds were below 1% and below 1.0 respectively.
This comparison exercised semi-transparent, transformed and interleaved
pen/PNG/one-frame GIF content. It is a numerical tolerance regression,
not an exhaustive proof of every alpha/GIF frame combination.

The DPR 2 repeated-wheel lifecycle test imported 3,000 strokes and
completed 48 wheel cycles, followed by clearing the board. Measured
cache peak was 2,016,464 / 1,828,400 physical pixels in the two runs,
under the 4,000,000 ceiling. Active/prepared cache groups were absent
after clear. It is a repeated interaction stress check, **not** a
multi-hour teaching-session soak or a direct GPU texture allocation
measurement.

### Remaining release risks

- Zoom p95 and maximum frame gap remain variable, particularly on
  animated scenes with 1,000–3,000 document strokes. Stable 60 fps
  cannot be claimed.
- Chrome rAF timestamps are not a full GPU/compositor timeline, and
  the profiler does not establish causality for every long frame.
- Short-lived scene/hit caching is bounded by scene physical pixels;
  actual browser/OS/GPU memory overhead warrants high-DPI profiling
  on end-user hardware.
- Multi-hour collaboration, reconnect, mixed moving GIF frames and
  device-specific alpha/color-management parity require independent
  longer-duration verification.


## C3.6 — Nonblocking wheel input when idle prewarm is unavailable

Stacked candidate: draft [PR #198](https://github.com/ArtemLevin/tutorboard/pull/198),
based on C3.5 draft PR #197. Measured source SHA
`4fc9d4d480365d3f6784d05630387e3d50cc67da`.
[GitHub Actions run 37975430796](https://github.com/ArtemLevin/tutorboard/actions/runs/37975430796):
quality gate (1096 unit/integration, 25 performance), Chromium and Firefox
smoke, GeometryOS, coordinate plot, Board-only and media performance
(16/16) passed. Additional companion gates on earlier C3.6 SHA passed.

The C3.5 browser profile had shown a 43.8 ms synchronous cache build
inside the first wheel event after prewarm starvation in the 3000-stroke
scenario. C3.6 keeps the real pen vector renderer active on the cold path
and skips any synchronous cache build in the wheel input handler.
Idle-prepared scene and hit caches remain active where available.
The heavy 3000-stroke e2e now **forces no requestIdleCallback progress**
to make the cold path deterministic and enforces begin duration <25 ms.

| 3000 strokes + 6 PNG + 4 GIF | C3.5 baseline CI 37970012084 | C3.6 candidate CI 37975430796 |
| --- | ---: | ---: |
| Cold cache available before wheel | no | no, forced |
| Wheel handler begin | 43.8 ms | **0.1 ms** |
| Wheel rAF p95 | 50.0 ms | **33.4 ms** |
| Maximum wheel rAF interval | 133.4 ms | **100.0 ms** |
| Wheel frames >25 ms (48 samples) | 15 | 17 |

Other candidate scenarios:
300 static zoom p95 16.8 ms / max 33.4 ms;
300 with four GIF zoom p95 33.4 ms / max 33.4 ms;
600 static zoom p95 33.4 ms / max 66.6 ms;
600 with four GIF zoom p95 33.4 ms / max 33.4 ms;
1000 with four GIF (cold) zoom p95 33.4 ms / max 50.0 ms.
Single hosted-run measurements vary with concurrent runner load.

DPR2 pixel comparison of prepared vs cold uncached path passed:
significant channel fraction `0.009928390538945711` (<0.01);
mean absolute channel error `0.17597253638867033` (<1).
48 high-DPI wheel cycles under prewarm starvation: zero cache builds,
zero observed retained cache pixels; final board-clear cleanup passed.

**Release conclusion:** Removing the synchronous cold cache build is verified
and appears to improve worst-case zoom in this sample. However 100 ms frame
gaps remain, and zoom p95 around 33 ms is still below 60fps-equivalent
cadence. Repeat the browser performance comparison before considering merge.
Further investigation should split animation work, React commit work,
Konva layer redraw and browser composition in a 3000-pen cold-zoom trace.
Do not claim complete resolution of heavy-scene jank.


## C3.7 — split timing of React, Konva and Chromium composition

Stacked draft [PR #199](https://github.com/ArtemLevin/tutorboard/pull/199)
on C3.6. Opt-in tracing runs only when the Playwright browser fixture
installs `window.__tutorBoardC37Trace`; the production application does
not retain frame-event buffers. The Layer draw wrappers are restored on
effect cleanup. GIF invalidation timing measures `batchDraw` *request*
cost rather than pixel paint; the Konva scene/hit wrappers measure the
synchronous JavaScript drawing operations. React `board-commit` covers
viewport update dispatch through layout effect (including scheduling
and react-konva reconciliation), and is **not** React-exclusive CPU time.

### Isolated application-side measurements

[Quality and browser CI 37979094962](https://github.com/ArtemLevin/tutorboard/actions/runs/37979094962):
1096/1096 unit/integration, 25/25 performance, build, Chromium/Firefox smoke,
GeometryOS and Coordinate Plot passed. The initial media-performance
job found an overly strict e2e assertion that expected no React ink run
updates despite the visible-item set changing during wheel zoom; this
was corrected, while the stable-membership unit/performance guard remains.

In 500-stroke, stable-membership React profiling, seven zoom updates
produced **0 additional React Group renders**, median update 0.369 ms
as recorded by `DENSE_SCENE_CPU_PROFILE`.

For 3000 strokes, six PNGs and four GIFs with intentionally starved
`requestIdleCallback`:

| Metric | First trace | Chromium CDP trace |
| --- | ---: | ---: |
| Zoom p95 rAF interval | 50.1 ms | 33.4 ms |
| Max zoom rAF interval | 99.9 ms | 116.7 ms |
| Wheel begin | 0.1 ms | 0 ms |
| React viewport dispatch→layout total/max (six commits) | 61.9 / 12.5 ms | 63.5 / 15 ms |
| Konva scene draw total/max | 66.1 / 10.2 ms | 66.1 / 10.6 ms |
| Konva hit draw total/max | 46.7 / 8.2 ms | 47.2 / 8.1 ms |
| GIF redraw requests count/total | 38 / 0.6 ms | 47 / 1.3 ms |

The second profile ran on
[GitHub Actions 37980204017](https://github.com/ArtemLevin/tutorboard/actions/runs/37980204017),
where **16/16 media performance cases passed** along with all other jobs.
It includes these Chromium trace events (milliseconds):

| Chromium event | Count | Total duration | Maximum |
| --- | ---: | ---: | ---: |
| `DirectRenderer::DrawFrame` | 37 | 756.47 | 25.77 |
| `LayerTreeHost::DoUpdateLayers` | 37 | 203.08 | 14.24 |
| `Surface::CommitFrame` | 38 | 9.78 | 0.65 |
| `LayerTreeHostImpl::PrepareToDraw` | 37 | 3.44 | 0.16 |

The browser observer also reported one 119 ms Long Task. These
compositor traces identify a significant browser rendering/composition
burden. They do not alone establish which overlapping trace event
caused that Long Task or the maximum rAF interval; trace durations
on different threads can overlap and should **never be summed to infer
frame time**. A headless Linux runner is not a multi-device GPU
confidence interval.

### Decisions

- Keep the narrow React stable-run optimization and the corrected
  active-versus-prepared cache diagnostic guarded by tests.
- Keep the PR in Draft: the current evidence does **not** demonstrate
  reproducible removal of long rAF gaps. In particular, 100–117 ms
  maxima persist despite eliminating cold-wheel cache builds.
- Next performance candidate should target the number/cost of
  full-viewport compositor/redraw updates during wheel gestures.
  Evaluate an A/B experiment with production-like PNG+GIF+ink ordering,
  preserve per-object z-order and hit testing, verify DPR2 pixels and
  48-cycle bounded-memory cleanup, then repeat Chromium and Firefox
  browser checks.
