# C3.9-S5.3 / initial S5.4 — guarded single Konva crop

Date: 2026-10-11. Issue: [#201](https://github.com/ArtemLevin/tutorboard/issues/201).
Incremental [Draft PR #222](https://github.com/ArtemLevin/tutorboard/pull/222)
targets S5.2 [Draft PR #221](https://github.com/ArtemLevin/tutorboard/pull/221).
Stable main is `8a24b882b2a84472bc530691e47171a7775e74a6` and remains unchanged.

## Engineering scope implemented

- **Experiment gating:** A2 requires **both** Vite build mode `c39-s5-a2` and the
  `window.__tutorBoardC39S5A2=true` initialization flag before React mounts.
  All normal production bundles execute the existing code path, regardless
  of a query parameter, localStorage or a later console assignment.
- **Contiguous z-order:** `BoardStage` selects at most one S5.2 bounded run
  from the *committed* visible viewport. `BoardSceneContent` splits the
  matching pen-only group into before / selected / after **without
  reordering objects or creating duplicate original Konva nodes**.
  A run missing from the current committed paint layer falls back to vector.
  With A2 activated, only the selected 80–256-stroke subrun can be registered
  with the wheel coordinator; remaining groups stay vectors.
- **Runtime revalidation:** `WheelInkCacheCoordinator.register` accepts a
  bounded expected crop. Before calling Konva Group.cache, it checks
  `getClientRect({skipTransform:true})` and conservative 3px raster margins
  against the proposed rectangle. If the mounted live geometry exceeds the
  planned crop, it skips caching and preserves vectors. Opt-in bounds-lookup
  failure, cache-allocation error, bad DPR and insufficient shared budget
  also skip caching. No synchronous cold build during wheel input.
- **Resource ownership:** The S5.2 shared scene/hit/scratch CPU buffer budget
  is only passed to the coordinator in the experimental mode; existing
  `WheelInkCacheCoordinator()` callers retain the previous behavior.
  Prepared buffers are invalidated on scene edits/selection, viewport
  commit, end/cancel, unmount or prep expiration, with release of owned leases.
- **Diagnostics:** `data-c39-s5-a2-enabled`,
  `data-c39-s5-a2-candidate-count`, `data-c39-s5-a2-candidate-bytes`,
  and `data-c39-s5-a2-cache-failures` on the stage.

Changed: `BoardStage.tsx`, `board-scene-content.tsx`,
`wheel-ink-cache.ts`, new S5.3 focused unit tests, new S5.4 browser
fidelity spec, and dedicated Chromium/Firefox workflow.
No persisted-format, backend, authorization or deployment changes.

## Tests / factual outcomes

- [Initial browser run #38126114471](https://github.com/ArtemLevin/tutorboard/actions/runs/38126114471)
  on pre-documentation S5.3 source: separate Chromium and Firefox test jobs
  built the *same* opt-in candidate bundle and mounted A0/A2 via
  independent browser contexts. The A2 test successfully observed
  **one retained cache**, selection of a candidate with at least 80 pen
  strokes, and zero reported cache-build failures.
- That initial run **FAILED strict pixel equality**: 4 changed pixels
  out of 4,067,200 in Chromium, largest RGBA-channel delta **1**;
  5 changed pixels in Firefox, largest delta **2**.
- [Instrumented second run #38126279584](https://github.com/ArtemLevin/tutorboard/actions/runs/38126279584)
  independently proved A0 vs separate A0 context has **zero changed
  pixels in both browsers**. The A0/A2 change reproduced: Chromium
  4 pixels (max channel 1); Firefox 5 pixels (max channel 2).
  Representative coordinates in DPR2 stage screenshot:
  Chromium (433,318), (434,318), (322,967), (316,968);
  Firefox (433,318), (434,318), (274,319), (1113,1015),
  (1114,1015). Test logs and screenshots are archived in CI artifacts.
- Browser tests executed **original app selection and undo-key handling
  before the strict pixel assertion**, without a separate selection
  error. This is **not** proof of complete hit identity on every node,
  partial eraser semantics, document undo/redo chains or collab parity.
- [Original S5.2 focused CI #38124759687](https://github.com/ArtemLevin/tutorboard/actions/runs/38124759687)
  passed typecheck and 28/28 tests for the inherited planner/budget.
  S5.3 adds 5 focused tests (contained/mismatched crop, DPR cleanup,
  unmount, detached node). Final S5.3 commit requires its own CI result.

**Current gate: S5.3 implementation completed; S5.4 strict screenshot
parity FAILED.** Do not claim full fidelity, do not merge this candidate,
and **do not run A0/A2 throughput/p95 ABBA** while this mismatch persists.
Avoid weakening the assertion or enlarging pixel tolerance to obtain a
green gate. The measured delta is visually tiny yet reproducible and
exceeds independently observed A0/A0 baseline noise (zero).

## Cause and next step

Working hypothesis: Konva Group.cache scene rasterization changes
subpixel antialias/compositing for some pen edges. The sampled locations
and two-engine repeated evidence support investigation but do not yet
prove the exact internal cause.

1. Inspect saved A0/A2 pixel neighborhoods and affected original
   vector-ink paths, including transparency, rounding and cache crop
   origin. Instrument one-stroke and adjacent-stroke reproductions at DPR1
   and DPR2 to identify which Konva pass diverges.
2. Correct scene-sampling differences or explicitly revisit pixel
   acceptance via a **separate, reviewed fidelity contract** based on
   independent baseline noise; never quietly relax tests after failure.
3. Complete S5.4 matrix: pen/image/pen z-order, canonical original hit
   owner, selection/drag, partial eraser, undo/redo from persisted state,
   repeated 48 wheel sessions, clear/unmount, DPR/resize, permission
   and remote invalidations, representative 4 PNG + 6 JPEG decoding.
4. Only after all fidelity and final quality gates pass, run the frozen
   two-runner paired A0/A2 ABBA on 5k and 10k + 10 static media.
   Success still requires ≥20% active p95 improvement on both runners
   with no >100ms regression. Given S5.2 cached coverage (6.4% /
   3.2%), substantial gain is uncertain.

This document is a measurement/implementation record, **not production GO**.
The main branch is unchanged, PR #222 stays Draft, and Issue #201 stays open.
