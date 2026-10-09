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

## C3.2-A — wheel-aware GIF pacing: repeated measurements

Candidate PR #193 reuses the existing transient 24-fps GIF redraw pacing during
wheel zoom. Regular animation resumes on commit/cancel, authoritative viewport
synchronization and cleanup. The committed Konva Layer and object ordering
are unchanged. This limits GIF-driven redraw frequency during a wheel gesture;
it does not cache static paths or isolate them from animated content.

### Profile provenance

- Baseline source: `8d5240a35a5891ac6aeb7873029e52ab7e481838`;
  [CI 37890197582](https://github.com/ArtemLevin/tutorboard/actions/runs/37890197582),
  initial sample and rerun of the Media performance profile job.
- Candidate source: `305d88ccb8ef75aee34a31165b64265eeec0079a`;
  [CI 37896592812](https://github.com/ArtemLevin/tutorboard/actions/runs/37896592812), initial sample.
- Candidate docs-only HEAD: `8d4e7740cfcbe49ca243cf51549c0d37618e759d`;
  [CI 37897271871](https://github.com/ArtemLevin/tutorboard/actions/runs/37897271871),
  initial sample and rerun of its Media performance profile job.
  Runtime implementation is identical in these three candidate samples.

All five profile job executions succeeded. Candidate Chromium and Firefox smoke
and the full pre-documentation-update CI completed successfully. Every profile
used the same Chromium 2×2 fixture: 300/600 pen strokes, six distinct large
PNG sources and 0/4 GIFs, with 48 measured rAF intervals per interaction.

### Raw observations (chronological sample order)

| Scenario | Baseline zoom p95 (2) | Candidate zoom p95 (3) | Baseline zoom drawImage (2) | Candidate zoom drawImage (3) |
| --- | --- | --- | --- | --- |
| 300 pen, 0 GIF | 16.7 / 16.8 ms | 16.8 / 16.8 / 33.3 ms | 36 / 36 | 36 / 36 / 36 |
| 300 pen, 4 GIF | 33.4 / 16.7 ms | 33.4 / 33.3 / 33.4 ms | 510 / 530 | 370 / 360 / 390 |
| 600 pen, 0 GIF | 33.3 / 16.8 ms | 33.4 / 33.4 / 33.3 ms | 36 / 36 | 36 / 36 / 36 |
| 600 pen, 4 GIF | 66.7 / 49.9 ms | 66.7 / 50.1 / 66.7 ms | 540 / 540 | 460 / 420 / 460 |

**Confirmed narrow improvement:** for the largest animated fixture, redraw
work decreases from 540 calls in both baselines to 420–460 in all candidate
runs, a 14.8–22.2% reduction. At 300 strokes with GIFs all candidate counts
are also below both baseline counts. Static-only counts remain at 36.

**Unconfirmed p95 improvement:** the unchanged baseline itself varies between
49.9 and 66.7 ms in the heaviest scene; the candidate varies between 50.1
and 66.7 ms. The favorable candidate sample cannot establish improved
latency, FPS or input responsiveness. The 48-frame samples are discrete,
runner-dependent and too small to establish cross-device confidence.
The main heavy-board stall remains open.

The new cross-browser smoke checks GIF redraw resumes after wheel gestures;
existing coordinator tests cover interactive pacing and restoration. This
optimization is an incremental reduction in drawing work, with unchanged
persistent formats, media authorization and layering.

### C3.2-B acceptance

Trace animated invalidation of the shared committed Layer; test bounded
static-content caching or ordered static render runs with interleaved GIF
and immutable strokes. Preserve arbitrary stacking order, hit testing,
selection, transforms, undo and resource cleanup. Require repeated paired
heavy-scene zoom p95 and visual equivalence checks before calling the
large-board latency issue resolved. Authenticated media traffic, multiuser
sessions, prolonged use and device diversity are outside this fixture.
