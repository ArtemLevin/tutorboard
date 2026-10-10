# C3.9-A · Reproducible large-board baseline

Date: 2026-10-10. Issue: [#201](https://github.com/ArtemLevin/tutorboard/issues/201).
Base: `main` [62ef048187193a400adf35f5cb31e0adcd4d6dbf](https://github.com/ArtemLevin/tutorboard/commit/62ef048187193a400adf35f5cb31e0adcd4d6dbf).

## Verified pre-C3.9 performance failure

Post-merge production-build [CI run 38028358575](https://github.com/ArtemLevin/tutorboard/actions/runs/38028358575),
media performance job `114144395738`, produced a **166.7 ms maximum rAF gap** (zoom p95 33.4 ms)
and **175 ms Long Task** for 3000 pen strokes + 6 PNG + 4 GIF on headless Chromium.
The exact artifact also reports Konva scene max 9.2 ms, Konva hit max 7.7 ms, viewport
dispatch→layout max 11.2 ms, compositor `DirectRenderer::DrawFrame` max 33.23 ms.
Those are separate timings, so their sum is not a frame duration.
The C3.8 A/B/A maximum was 100.0 → 166.7 → 83.2 ms; GIF invalidations fell 48 → 39 → 46.
The root cause is still unknown.

## New representative fixture, keeping old defaults intact

`tests/fixtures/dense-board.ts` supports opt-in varied 2–6-segment ink with variable
pressure/opacity/width, configurable visible pen density, and paint order variants:
`trailing`, `split` and `alternating` (exercise the six-layer fallback).
Unchanged callers retain the previous repeated strokes and image ordering.
`tests/fixtures/media/c39-animated-64x64.gif` is a genuine four-frame,
64×64 animated GIF with 90–130 ms delays (generated fixture artwork, no external requests).
The new spec also creates six 1536×1536 deterministic PNGs.

## Browser measurement

`tests/e2e/c39-large-board-profile.spec.ts` imports an actual BoardDocument into the
production-built Vite/Playwright board, observes 18 alternating wheel events with
one rAF between events, tracks timestamps from the browser monotonic clock,
and separates **active wheel**, **post-input commit observation** and **settling**
intervals. The commit window ends when Playwright sees the wheel GIF-pause flag
return to `false`; this is an **observation bound**, not an exact React-commit timestamp.
C3.9-B will add exact per-frame trace markers. Each phase publishes p50/p95/p99/max,
counts exceeding 25/50/100 ms, raw frame gaps, input timestamps, DPR,
scene/layer count, cold/warm status and commit observation timestamp.
A JSON artifact and `C39_REPRESENTATIVE_BASELINE` log line are attached per run.
No timing threshold is asserted on a noisy shared runner; assertions verify
observable interactions and measurement completeness.

## Matrix

| Test name | Strokes | Requested visible strokes | PNG | Actual GIF | DPR | Paint order | Cache mode | CI |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| 300-static | 300 | 300 | 6 | 0 | 1 | trailing | normal | quick |
| 1000-multiframe | 1000 | 450 | 6 | 4 | 1 | split | normal | quick |
| 3000-cold-mixed | 3000 | 800 | 6 | 4 | 2 | alternating | cold / idle-starved | quick |
| 600-static | 600 | 600 | 6 | 0 | 2 | trailing | normal | extended |
| 3000-warm-dense | 3000 | 2400 | 6 | 4 | 1 | split | normal | extended |
| 3000-offscreen | 3000 | 150 | 6 | 4 | 2 | trailing | normal | extended |
| 5000-heavy-mixed | 5000 | 2500 | 6 | 4 | 2 | alternating | cold / idle-starved | extended |

`visibleStrokes` controls coordinates; actual viewport selection depends on zoom,
overscan and geometry. Label it *requested* rather than asserting a fixed exact visible count.
`normal` cache mode is opportunistic and records observed prepared state.

### Run commands

```sh
npm ci
npm run test -- tests/unit/core/c39-dense-board-fixture.test.ts
npm run e2e:media-profile -- --project=chromium --retries=0
npm run e2e:c39-profile
npm run check
```

The existing CI media-profile job includes all `@media-profile @c39-quick` cases,
while `npm run e2e:c39-profile` also executes `@c39-extended` profiles.
Firefox smoke, DPR2 pixel fidelity, media cache and all other release gates remain
unchanged. Extended profiles should run serially to reduce intra-run interference.

## Constraints and next release gate

A 48-frame sample and aggregate CDP timings from C3.8 cannot establish exact
long-frame causes. Stage C3.9-B must align input IDs, React/Konva and compositor
events, including pid/tid, to individual slow windows. Changes in this block
are confined to tests/fixtures/docs and an npm script; production drawing,
permissions, schemas and network protocols remain untouched.

## First measured representative matrix (one Chromium CI run)

Full [C3.9 browser workflow 38031741442](https://github.com/ArtemLevin/tutorboard/actions/runs/38031741442),
on [PR #204](https://github.com/ArtemLevin/tutorboard/pull/204) head
`e57e2fb071224b08b2aa106727ceb25d76e7ec32`
(GitHub Actions test merge SHA `f86ce1829f7fcc1a45a16b7424146102e93a447b`).
**7/7 serial Chromium tests passed** (56 s). The artifact includes full timestamps,
individual frame gaps and phase labels.

| Scenario | Active p95 / max ms | Commit-observed p95 / max ms | Settling p95 / max ms | Visible paint layers at start |
| --- | ---: | ---: | ---: | ---: |
| 300-static | 16.7 / 16.8 | 16.8 / 16.8 | 16.8 / 16.8 | 1 |
| 1000-multiframe | 16.8 / 16.8 | 100.0 / 100.0 | 16.7 / 16.7 | 3 |
| 3000-cold-mixed | **150.0 / 166.7** | 133.3 / 133.3 | 66.8 / 83.3 | 1 (alternation fallback) |
| 600-static | 16.7 / 33.4 | 66.7 / 66.7 | 33.4 / 33.4 | 1 |
| 3000-warm-dense | 16.7 / 16.8 | **216.7 / 216.7** | 16.8 / 166.6 | 5 |
| 3000-offscreen | 33.4 / 33.4 | 133.3 / 133.3 | 33.4 / 33.4 | 2 |
| 5000-heavy-mixed | **250.0 / 283.3** | 166.7 / 166.7 | 133.3 / 133.4 | 1 (alternation fallback) |

This run proves the *test harness can reproduce* long frame intervals in
realistic mixed-media scenes. It does **not** establish whether the single-layer
fallback itself causes the delay, nor a statistically stable baseline across
independent runners. Some wheel event processing can exceed the existing 120 ms
debounce; the observable wheel-pause flag can already be false after all inputs.
The recorder no longer assumes all 18 inputs form one uninterrupted gesture.
Classify the commit window as **observed**, not precise, until C3.9-B correlates
it to renderer events. Earlier C3.8 fixtures were less representative and their
numerical latency cannot be directly compared to the new workload.

**Status:** representative C3.9-A seven-scenario browser matrix passed;
broader CI on the same PR head and post-documentation head is part of the
merge gate. This change creates measurements and tests only; there is
no established production-frame improvement from C3.9-A.

