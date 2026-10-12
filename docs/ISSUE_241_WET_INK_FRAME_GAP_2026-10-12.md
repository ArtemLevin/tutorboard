# Issue #241 — 240 Hz wet-ink frame-gap attribution (12 October 2026)

## Observable failure

On Firefox shared-runner smoke, the test `active-stroke-latency.spec.ts` occasionally measured `maxFrameGap = 178 ms` while the required budget was `< 150 ms`. A same-SHA rerun passed. The measured gap includes both actual wet-ink drawing work and time waiting for the browser/main thread to deliver another animation frame.

The test sends four coalesced pen samples per animation frame (90 frames) plus a 64-sample burst. It checks the same `maxFrameGap < 150 ms`, input-to-render p95 `< 100 ms`, bounded backlog, bounded mutable tail, and Long Task limits.

## Attributed cost versus frame-scheduling delay

Added read-only diagnostics in `WetInkRenderer`:
- worst interpaint frame gap and timestamp in the browser performance clock;
- surface drawing duration on that worst frame;
- maximum actual surface drawing duration across the stroke.

The renderer's drawing and rendering paths remain unchanged. A deterministic unit test injects a 170 ms clock gap with a 3 ms surface draw and verifies the two costs are reported independently.

## Reproduction protocol / comparable runs

Two independent GitHub Actions runs performed `8` test repetitions per browser and runner worker-count combination (`chromium/firefox × workers 1/2`), no retries, 64 total executions. Each run built the same code and used a dedicated runner per matrix combination. Actual sample counts and output were collected as `WET_INK_240HZ_EVIDENCE` entries.

| Browser | Workers | Worst gap in run 1 | Worst gap in run 2 | Worst surface draw across runs |
| --- | ---: | ---: | ---: | ---: |
| Chromium | 1 | 59.3 ms | 86.3 ms | 8.5 ms |
| Chromium | 2 | 83.5 ms | 115.8 ms | 10.3 ms |
| Firefox | 1 | 74 ms | 74 ms | 5 ms |
| Firefox | 2 | 130 ms | 146 ms | 18 ms |

Sources: [diagnostic run 1](https://github.com/ArtemLevin/tutorboard/actions/runs/38231526421) and [diagnostic run 2](https://github.com/ArtemLevin/tutorboard/actions/runs/38231690309).

**Interpretation:** additional browser workers correlate with larger frame gaps while actual wet-ink drawing remains much shorter than the frame budget. The main-thread/runner scheduling component dominates the worst intervals. This supports shared-runner interference as a major source of CI variance, without proving that every real-world frame delay has the same cause. The observed 178 ms excursion did not reproduce in the controlled runs; there is no measured renderer hotspot justifying a speculative algorithm change.

## Applied CI fix

The time-sensitive 240 Hz smoke is assigned `@frame-budget` and executes as a mandatory **sequential step** following the ordinary smoke tests in each existing Chromium/Firefox matrix job, with `--workers=1 --repeat-each=3 --retries=0`. Parallel browser smoke excludes this one scenario; production-image already requires the browser smoke matrix and therefore also requires the isolated budget step. Reusing the installed browser avoids duplicated browser provisioning on separate runners. No performance budgets were raised, and the test is neither skipped nor marked expected-to-fail. The rest of the browser tests keep their parallel execution.

The isolated job is intentionally CPU-uncontended with respect to other Playwright workers on its runner. If a gap above 150 ms now occurs, the job fails and uploads measurement evidence. The test also records the gap's surface-draw duration and associated Long Task intervals (when the browser supports that observer).

## Verification and follow-up

- Unit: synthetic delayed rAF frame attributes a large interpaint gap to scheduling even when surface draw is 3 ms.
- Focused: strict 240 Hz Playwright repetitions on Chromium and Firefox, 1/2 worker comparison.
- Required gate: lint, typecheck, unit, performance budgets, all browser jobs, media profile and production image.
- Limitations: scheduling isolation stabilizes the **CI performance measurement**, and cannot guarantee that a busy real-world operating system will never suspend a browser frame. Future renderer optimization requires evidence of significant in-renderer cost on representative large boards.
- Issue #241 remains open for independent GIF invalidation cadence analysis.
