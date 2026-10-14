# C3.9 — viewport continuity and post-clear zoom frame probe (14.10.2026)

Issue: [#201](https://github.com/ArtemLevin/tutorboard/issues/201).

## Confirmed defects

The default canvas adapter read `previewViewport` from the React-render closure after a debounced wheel commit. A wheel input arriving before React committed the previous value could use stale zoom. The `scene.viewport` effect also cancelled a new wheel session when an acknowledgement of the previous local commit arrived.

The older draft [PR #232](https://github.com/ArtemLevin/tutorboard/pull/232) reproduced these races but tracked acknowledgements by original input identity. Current main's frozen snapshot reducer validates and **clones** the viewport, so this old identity marker is incorrect on the current reducer.

## Change

- Keep the latest calculated preview in a synchronous ref independent of React scheduling.
- Return the accepted canonical viewport from the application commit adapter. Track its exact object identity in a WeakSet, consuming each local acknowledgement exactly once. Equal numeric values from external sources still trigger the authoritative reset. Legacy callbacks returning void retain external-update semantics.
- Keep the existing 120 ms debounce, viewport document commands, undo, collaboration and persistence.
- Skip repeated full Konva node search and overlay redraw when selection is empty and the Transformer has no nodes.

## Reproduction and evidence gate

Unit test: `tests/unit/adapters/canvas-konva/board-stage-viewport.test.tsx` exercises a copied canonical ACK, subsequent input before React render, delayed ACK, external equal-number replacement and restoration of an old acknowledged identity.

Browser: `tests/e2e/cleared-board-zoom-profile.spec.ts` profiles an initial empty board, then imports 3000 varied ink strokes plus 10 real 512px PNGs, clears through the UI and profiles zoom from 1x to >5x and back. It records raw frame gaps, p95/max and frames >50 ms, opt-in browser Long Tasks, phase durations and no-selection Transformer sync, and Chromium JS heap/GC time for both empty states, together with resource cleanup checks. The CI smoke job uploads a bounded JSON artifact even on success. Because wall-clock frame timing is affected by CI host scheduling, this is diagnostic evidence; the test does not impose an uncalibrated relative p95 threshold.

Run `npm run check` and `npx playwright test tests/e2e/cleared-board-zoom-profile.spec.ts --project=chromium --workers=1`, plus full Chromium/Firefox smoke and representative 5k/10k static-heavy profiles. Record the exact HEAD SHA, runner and results before claiming end-to-end latency improvement.

## Status

Implementation is committed for review. Runtime performance GO and release remain open until exact-head browser profiles and CI are inspected. No schema, persisted bytes or protocol changes were introduced.

## First exact-head CI and browser findings (14.10.2026)

A prior exact-head workflow on `af68b4a` passed format, lint, typecheck, unit tests, all performance budgets, architecture, production build, 62 Chromium and 62 Firefox smoke tests, and three additional pen budget browser cases in each engine.

The instrumented `cdecebe9` experiment (GitHub Actions CI run 38554824294) produced the following **single-run Linux headless synthetic** observations (rAF capture on a fresh empty board vs the same board cleared after 3000 varied strokes and 10 PNG):

| Engine | Fresh n / p95 / max (ms) | Cleared n / p95 / max (ms) | >50 ms frames |
| --- | --- | --- | --- |
| Chromium | 102 / 16.80 / 33.30 | 96 / 16.72 / 16.80 | 0 / 0 |
| Firefox | 105 / 17.36 / 49.50 | 102 / 17.38 / 32.64 | 0 / 0 |

Chromium forced-GC retained heap: fresh **11.85 MB**, cleared **25.58 MB**; measured collection calls took 50.9 ms and 80.9 ms, respectively. Existing Undo retains the heavy document by design. All 48 viewport transitions in each measured arm had zero Transformer synchronization events with empty selection. There were zero reported Long Tasks in these samples; this is not a Windows device endurance result or a claim about arbitrary 10k boards.

The production-image Docker build in this workflow failed because `.dockerignore` excluded `tests/fixtures/dense-board.ts`, imported by a source-colocated TypeScript test. An allowlist for only that synthetic fixture is being delivered in the next commit, retaining the rest of the test exclusion. Re-check the exact head's Docker image gate.
