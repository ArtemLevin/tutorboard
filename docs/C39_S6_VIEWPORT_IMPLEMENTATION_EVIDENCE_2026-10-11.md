# C3.9-S6 — viewport commit: implementation evidence and decision gates

Date: 2026-10-11  
Issue: [#201](https://github.com/ArtemLevin/tutorboard/issues/201)  
Work branch: `perf/c39-s6-viewport-commit` (from `main`, independent of S5/A2 #225)  
PR: [#226](https://github.com/ArtemLevin/tutorboard/pull/226), **Draft / experiment**

## Verified inspection (pre-implementation)

- `BoardStage.commitWheel` settles preview viewport and invokes `onViewportCommit`
  after wheel debounce. Existing `wheel-viewport-persist` measures a **synchronous
  callback interval** only; worker persistence is not covered by this span.
- `App.commitViewport` commits `core.viewport.set`; the document controller
  calls `reduceBoardDocument`, enqueues immutable history and calls the
  collaborative command handler, while the local document-change effect
  schedules autosave.
- `reduceBoardDocument` validates **all** current objects with
  `validateBoardDocument` before dispatch. The command-specific `setViewport`
  already validates only viewport and `updatedAt`; this optimization existed
  in main before S6.
- `createBoardSceneSelector` fully iterated `document.order` for every fresh
  BoardDocument identity, even when only viewport/updatedAt changed; it reuses
  individual render-item objects but allocated a new order array and Map.
- `LocalDocumentAutosave.schedule` synchronously invokes
  `repository.prepareSave`. Worker `postMessage` clones a document
  synchronously before asynchronous work. The existing 350ms debounce and
  lifecycle flush must remain intact. In connected mode, a viewport command
  has an inverse and goes through the durable ordered `BoardSyncEngine.queue`.

## Implemented S6.1–S6.2 (requires final-head CI verification)

1. `createBoardSceneSelector` now reuses its existing ordered
   `BoardRenderItem[]` and cache when every non-viewport, non-`updatedAt`
   BoardDocument field retains reference/value identity. The new scene retains
   the latest viewport. Full rebuild remains mandatory on order, objects, group,
   geometry, solid records, schema/id/title/createdAt changes. Normal edits and
   selection/transform semantics are preserved; `cacheSize` and `reset` still
   behave as before.
2. The opt-in `__tutorBoardC39ViewportTrace` sink collects at most 12,000
   synchronous JS spans, disabled by default. Instrumented categories:
   `viewport-reduce.prevalidate`, `viewport-reduce.dispatch`,
   `viewport-history`, `viewport-command-callback`,
   `viewport-scene-select` (detail: same-document/reuse-items/full-rebuild),
   `viewport-local-autosave.schedule`,
   `viewport-local-worker.postMessage`, `viewport-sync.queue`.
   No command payloads, secrets or board content are logged.
3. The existing 3k/5k/10k/static-offscreen browser matrix emits S6 raw
   events and per-kind p95/total when explicitly enabled. A separate 2-runner,
   2-repeat GitHub Action is defined for Chromium DPR2. Trace is cleared after
   document import so measurements focus on 18 wheel inputs and settling.
4. Unit regression cases cover viewport-only reference reuse, full invalidation
   across dependent document fields, correct ordered output, selector reset
   and 5k object cache length; trace unit tests verify opt-in and capacity.

## Explicit unresolved work

- **S6.1 actual quantitative gate:** obtain independent-runner traces and
  determine whether full prevalidation, selector, postMessage or sync dominates.
  Only synchronous worker-postMessage clone time is captured so far: dedicated
  worker execution, IndexedDB transaction time and GPU compositing are not
  represented by these new events. Existing C3.9 scene/hit and rAF traces
  remain independent and overlapping; aggregate using frame-clipped union.
- **S6.3 trusted-validation boundary:** **not enabled**. Keep the public
  reducer's full invalid-input validation, access checks, command metadata,
  updatedAt normalization and existing error codes; only investigate a private
  provenance-safe acceleration after quantitative evidence.
- **S6.4 autosave/sync intervention:** **not enabled**. No changes to worker
  scheduling, local save / pagehide / revision transaction semantics, actor
  authorization, undo/redo, command queue or offline replay.
- **S6.5 release ABBA:** **not performed**. The first two-runner S6 workflow
  measures candidate diagnostics, **not** an independent paired A0/S6
  throughput acceptance comparison.
- **Production GO:** **not established**. Required: strict functionality,
  full CI, no data/memory regressions, two independent-runner A0/S6 ABBA
  with >=20% paired active-p95 improvement at both 5k and 10k, reduction
  in >100ms frames and no input latency regression. Remain Draft/NO-GO until
  those facts exist.

## Validation commands / environment

Current repository scripts: `npm run format:check`, `npm run lint`,
`npm run typecheck`, `npm run test`, `npm run performance`,
`npm run architecture`, `npm run build`. Focused tests:
`npx vitest run tests/unit/core/c39-s6-viewport-selector.test.ts
tests/unit/shared/c39-viewport-trace.test.ts`.
Browser evidence:
`C39_STATIC_HEAVY_PROFILE=1 C39_S6_PROFILE=1 npx playwright test
tests/e2e/c39-large-board-profile.spec.ts --grep @c39-static-heavy
--project=chromium --workers=1 --retries=0 --repeat-each=2`.
CI status and exact final commit SHA are to be recorded after completion.

**Decision:** S6.1–S6.2 diagnostic/minimal patch in Draft PR; performance
production acceptance pending. Keep `main` intact.
