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

## Final code-head checks and two-runner measurements

**Verified code SHA:** `2b83c631160e5462bfe03a9ef73866a6eed7b5d3`.

- [Full CI #38148005208](https://github.com/ArtemLevin/tutorboard/actions/runs/38148005208):
  **SUCCESS**. All quality, format, lint, typecheck, unit, performance,
  architecture, build, production image, Chromium/Firefox browser smoke,
  GeometryOS and media profile jobs completed successfully.
- [C3.9-S6 independent profile #38148005293](https://github.com/ArtemLevin/tutorboard/actions/runs/38148005293):
  **SUCCESS** on independent Chromium runners A and B. Each ran two repeats
  of four DPR2 static-heavy scenarios, for 16 scenarios in total.
  Raw JSON per-scenario evidence is retained in Playwright test attachments.
- Other code-head CI companions: C3.9 baseline, static-heavy baseline,
  render-run E2, media cache, authenticated media, recognition gates all passed.

**Measured 10k dense + 4 PNG + 6 JPEG, each repeat:**

| Runner/repeat | Active rAF p95 | full-document prevalidation p95 per call | Worker postMessage p95 per call | selector max |
| --- | ---: | ---: | ---: | ---: |
| A1 | 416.6ms | 242.4ms | 156.0ms | 0.1ms |
| A2 | 449.9ms | 462.3ms | 127.3ms | <0.1ms |
| B1 | 366.7ms | 371.0ms | 151.0ms | 0.1ms |
| B2 | 433.3ms | 262.0ms | 141.0ms | 0.1ms |

**Interpretation:** H1 and H3 confirmed as sizeable *synchronous intervals*
on actual browser input, with H2 selector rebuilding eliminated by strict
structural reuse. Dispatch/history/callback are sub-millisecond in these cases.
Local autosave schedule includes Worker postMessage cost; those spans are
nested and must **not** be added together. Per-call p95 and rAF p95 refer
to different sample populations. No claim of exclusive causal attribution
or percent end-to-end improvement is made.

**Release decision:** S6.1/S6.2 code and diagnostics **functional/CI GO**,
but **production performance NO-GO**. The active-frame tail remains poor.
The independent profile evaluates the S6 candidate only; A0/S6 ABBA and its
>=20% paired gain gate remain **unexecuted/unproven**. Public reducer must
continue rejecting invalid-current documents. Next bounded research block
S6.3/S6.4 must investigate formally owned immutable validation provenance
and/or avoiding full-document Worker cloning. Keep PR Draft and main unchanged.
