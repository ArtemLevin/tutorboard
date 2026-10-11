# C3.9-E1 — independent paired Chromium browser results

Date: 2026-10-10. Tracks [#201](https://github.com/ArtemLevin/tutorboard/issues/201).

## Evidence / provenance

- Implementation: [PR #210](https://github.com/ArtemLevin/tutorboard/pull/210), merged as `fd8b307469f36ef9a1c9279885c8171a51bc4015`.
- Executed diagnostic [PR #211](https://github.com/ArtemLevin/tutorboard/pull/211), read-only `pull_request` trigger; the candidate merged PR ref `925cb856321822748c6502e5f07f825426dfee1f` contains the same **production application code** as `fd8b3074`. Its additional workflow-event change is test-only.
- [GitHub Actions run 38050505528](https://github.com/ArtemLevin/tutorboard/actions/runs/38050505528): `paired-browser` and all steps successful; [raw JSON/log artifact](https://github.com/ArtemLevin/tutorboard/actions/runs/38050505528/artifacts/11669177738) (retained 14 days).
- A: `1bf2487d814a8dacde0ddc55ac57678f0b7b65c1` (main immediately before PR #209); B: test-only merge ref above, with PR #209 viewport fast path.
- Five chronological ABBA cycles = ten paired comparisons; ten independent fresh Chromium runs per arm on **one Ubuntu runner**. Chromium `149.0.7827.55`, Linux x64, Node `24.21.0`; 1240×820 DPR2; `3000-cold-mixed`: 3000 varied vector strokes, 800 intended visible, six 1536×1536 PNG, four real four-frame GIFs, alternating object order, cold idle prewarm. Benchmarked with opt-in bounded C3.9 trace.
- Comparator checked source SHA on every run, equal fixture/media, equal browser/platform, 18 wheel inputs and full ABBA ordering. Both arms exceed the requested 200 active-frame observations.

## Paired outcome

| Measurement | A: before #209 | B: after #209 |
| --- | ---: | ---: |
| Independent browser runs | 10 | 10 |
| Active-wheel rAF frame gaps | 680 | 706 |
| Median **run** active p95 | 133.35 ms | 116.70 ms |
| Median **run** active maximum | 166.65 ms | 150.00 ms |
| Active frames >50 ms | 477/680 (70.15%) | 440/706 (62.32%) |
| Active frames >100 ms | 152/680 (22.35%) | 48/706 (6.80%) |
| Commit-phase observed frame count | 41 | 47 |
| Median **run** commit p95 | 116.65 ms | 141.65 ms |

Median of ten *paired deltas* (candidate − baseline):
- active p95: **−16.70 ms**;
- maximum active gap: **−16.65 ms**;
- active >50 ms rate: **−2.91 percentage points**;
- active >100 ms rate: **−15.12 percentage points**;
- commit-phase p95 and max: **+8.35 ms** each.

These distinguish the paired median deltas from the differences of per-arm medians / pooled frame rates. Results prove a repeatable paired improvement in the measured active window, but **do not** meet C3.9-E release budgets (wheel p95 <=33.3 ms, max <100 ms). There is **no established commit-phase improvement**: commit has only 41/47 observed frames and is vulnerable to runner scheduling and phase-boundary variance. Do not infer a production speedup across other devices or scenarios from this single runner.

## Timestamp-aligned slow-frame observations

The representative scenario uses the **single-layer fallback** for >6 alternating static/GIF paint runs. Across all 20 runs, `before.layers=1` and `before.animatedLayers=0`. The event recorder was clock-aligned in every run.

Among the **five slowest recorded frames per run** (50 frames per arm, a biased slow-frame sample):

| Coincident event | A | B |
| --- | ---: | ---: |
| Slow frames containing `wheel-viewport-persist` | 35/50 | 12/50 |
| Slow frames **without** that event | 15/50 | 38/50 |
| `DirectRenderer::DrawFrame` event >=25 ms | 30/50 | 37/50 |
| `LayerTreeHost::DoUpdateLayers` event >=25 ms | 28/50 | 46/50 |
| Max coincident `DirectRenderer::DrawFrame` duration | 113.28 ms | 107.99 ms |

For `wheel-viewport-persist` events intersecting those slow frames, A durations range roughly **115–179 ms** and B roughly **57–107 ms** (35 versus 12 events). This supports the previous reducer CPU measurements: PR #209 eliminated one redundant full output validation. It is **not** a complete inventory of all viewport commits.

Trace events from different renderer/browser threads can overlap. Their durations **must never be added**; correlated compositor/layer events are evidence for the *next hypothesis*, not proof that this subsystem alone caused every long frame.

## Chosen next bounded block: C3.9-E2, compositor / paint-run fallback isolation

**Priority:** investigate the remaining >100 ms frame tails in highly interleaved GIF/static scenes, starting with the six-layer cap's single-layer fallback, viewport transforms and animation-driven invalidation.

1. Use the existing representative 3000-stroke/6PNG setup, varying **0 vs 4 genuine GIF**, 1–2 / 3–6 / >6 render runs, DPR1/2 and cold/warm cache with the same visible counts and order invariants.
2. Record paired active/commit rAF samples and clock-aligned Konva scene/hit, `LayerTreeHost::DoUpdateLayers`, `DirectRenderer::DrawFrame`, GIF invalidation and `wheel-viewport-persist` markers. Run with tracing both on and off to quantify instrumentation bias. Keep enough independent pairs and >200 active frames per arm.
3. Require an isolated, reversible intervention before claiming a root cause. If eliminating GIF invalidation or the fallback path removes the tail, design the smallest bounded repaint/viewport reuse change consistent with arbitrary z-order and exact hit canvas. Otherwise refine compositor attribution, and only then change rendering.
4. Run DPR2 pixel/alpha equivalence, selection/hit/transforms, 48-cycle media cleanup, clear/reopen/revoke, memory and full CI. Reject lower draw-call counts without reduced visible frame tails.

**Secondary independent candidate:** the remaining **mandatory full input `validateBoardDocument` pass** for viewport commands (C3.9-C/D measured ~70 ms of reducer work at 3000 strokes after optimization). Investigate separately at the trusted-state boundary. Do not bypass or cache untrusted validation through mutable object identity.

## Decision and limitations

The C3.9-D CPU fix is accepted as effective but insufficient. Next implementation effort must be gated by the focused E2 causal comparison; a speculative renderer rewrite is unwarranted. Issue #201 remains open for C3.9-E visual/latency acceptance and C3.9-F teacher/guest endurance. Production schema, auth and collaboration protocols were unchanged by PR #210 and this benchmark.
