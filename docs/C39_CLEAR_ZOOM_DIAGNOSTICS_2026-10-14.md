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

Browser: `tests/e2e/cleared-board-zoom-profile.spec.ts` profiles an initial empty board, then imports 3000 varied ink strokes plus 10 real 512px PNGs, clears through the UI and profiles zoom from 1x to >5x and back. It records raw frame gaps, p95/max and frames >50 ms for both empty states, together with a no-selection Transformer trace guard and resource cleanup checks. Because wall-clock frame timing is affected by CI host scheduling, this is diagnostic evidence; the test does not impose an uncalibrated relative p95 threshold.

Run `npm run check` and `npx playwright test tests/e2e/cleared-board-zoom-profile.spec.ts --project=chromium --workers=1`, plus full Chromium/Firefox smoke and representative 5k/10k static-heavy profiles. Record the exact HEAD SHA, runner and results before claiming end-to-end latency improvement.

## Status

Implementation is committed for review. Runtime performance GO and release remain open until exact-head browser profiles and CI are inspected. No schema, persisted bytes or protocol changes were introduced.
