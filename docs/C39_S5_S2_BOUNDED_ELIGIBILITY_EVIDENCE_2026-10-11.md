# C3.9-S5.2 — bounded pen-run eligibility and shared raster budget

Date: 2026-10-11. Task: [Issue #201](https://github.com/ArtemLevin/tutorboard/issues/201).
Research PR: [#221](https://github.com/ArtemLevin/tutorboard/pull/221).
Stable parent: `main` SHA `8a24b882b2a84472bc530691e47171a7775e74a6`.
Scope: **planner, shared lease accounting and verification only; A2 render path remains disabled**.

## What was implemented

- `src/adapters/canvas-konva/bounded-ink-candidate.ts`: deterministic selection of the longest supported **contiguous segment in original visible BoardRenderItem order**, capped at 256 objects, minimum 80. Only static user pen objects with no group transform, default style and no unsupported effects are eligible. Uses the *same* `createPenStrokeRenderBounds` geometry as production pen render paths; adds 3px conservative raster halo and computes the integer crop. The segment does not cross another object's document position; any unsupported object stops scanning the segment. Invalid DPR, oversized crop, short run and unsupported geometry return `null` (original vector path). This is an eligibility proposal, **not an allocation or authority to skip Konva live-bounds revalidation**.
- `src/adapters/canvas-konva/shared-ink-raster-budget.ts`: optional shared lease pool across owners `wheel` and `spatial`, accounting scene, hit and a full temporary scratch copy. Limits: 4,000,000 scene physical pixels and 16 MiB total accounted RGBA bytes, maximum one spatial candidate, idempotent release. The estimate omits GPU copies and possible library-private buffers; runtime rendering must verify actual canvas allocations before promotion.
- `src/adapters/canvas-konva/wheel-ink-cache.ts`: optional `SharedInkRasterBudget` constructor parameter and per-node owned leases. Default no-argument constructor keeps existing behavior. With the opt-in pool, insufficient capacity skips caching, releasing before/after cache failure or invalidation and falling back to the original vector group. A separate failed-run metric exposes caught allocation failures. No production caller passes an S5.2 budget, so production behavior is unchanged.
- `tests/unit/adapters/canvas-konva/bounded-ink-candidate.test.ts`: regression guards for the existing 5k/10k document fixtures, exact ordering, image-separated runs, unsupported styles/transforms, empty/oversized selection, DPR validation, scene/hit/scratch resource accounting, shared lease release, oversized wheel fallback and allocation failure. Existing wheel/paint-run tests are included in the focused CI job.
- `.github/workflows/c39-s5-s2-eligibility.yml`: reproducible focused typecheck + Vitest with the generated numeric eligibility lines `C39_S5_S2_ELIGIBILITY`; logs archived for source inspection.

## Measured fixture evidence

[Focused CI #38124450098](https://github.com/ArtemLevin/tutorboard/actions/runs/38124450098) on predecessor SHA `6958030009b5b4e4ed9435cafb3a579521af488e`: typecheck PASS, Vitest **3 files / 27 tests PASS** (S5.2 new tests plus existing wheel and paint-run coverage). Two C3.9 fixture measurements from its logs:

| Value | `static-5000-10-images` geometry | `static-10000-10-images` geometry |
| --- | ---: | ---: |
| Total requested pen strokes | 5000 | 10000 |
| Requested visible pen strokes | 4000 | 8000 |
| Items visible at 1240×820 baseline viewport | 4010 | 8010 |
| Static image objects | 10 | 10 |
| Selected contiguous pen strokes | **256** | **256** |
| Integer crop | (56,236), 962×318 | (56,148), 963×317 |
| Scene pixels, DPR2 | 1,223,664 | 1,221,084 |
| Accounted scene+hit+scratch bytes | **12,236,640** | **12,210,840** |
| Scene-pixel limit 4M | PASS | PASS |
| Shared RGBA budget 16MiB | PASS | PASS |
| Fraction of requested visible pen strokes covered | 6.4% | 3.2% |

The unit fixtures reuse the **exact `createDenseBoardDocument` stroke geometry and visibility parameters** from `tests/e2e/c39-large-board-profile.spec.ts`, preserve trailing image order and 4 PNG + 6 JPEG MIME/file-extension metadata. Fixture unit tests use small placeholder image data; the C3.9 browser workload separately generates genuine 1536px-class PNG/JPEG sources. Eligibility is a geometry/order question, so this proves geometric existence for the browser workload's scene construction; it **does not** establish actual PNG decode fidelity, Konva runtime crop equality, GPU memory or improved wheel p95.

A prior attempt to import app TypeScript directly from the NodeNext Playwright test harness caused TS2835 across app modules; that test-only change was reverted in full. Source app/module resolution and existing production browser profile were left intact.

## Engineering decision

**S5.2 geometric eligibility GO, A2 production NO-GO / unmeasured.** At least one contiguous bounded candidate exists within the conservative model's shared resource limits in each principal workload. This justifies a single guarded S5.3 renderer spike. Selected coverage is **small**: 6.4% / 3.2% of visible pen strokes respectively. Do not infer that caching this isolated region will meet the ≥20% end-to-end active p95 acceptance condition. A low-activation/no-speedup outcome must remain an explicit NO-GO, not a reason to relax the p95 target.

For S5.3, the actual Konva Group `getClientRect({skipTransform:true})` must be checked before any `cache()` call, and the raster swap must preserve the original pen→image→pen z-order and canonical Konva hit owners. Budget must be shared with the pre-existing wheel cache only under the opt-in A2 switch, and every cache must be invalidated on editing, undo/redo, clear, board switch and DPR/viewport changes. On any failed eligibility, capacity or raster build, retain the vector Group. S5.4 must prove browser pixel/hit/eraser/history and 48-cycle cleanup before paired A0/A2.

The source-only S5.2 branch remains Draft and main untouched. CI after the optional allocation-failure fallback patch and final documentation commit must be checked independently; do not treat the older passing focused run as final-head evidence. Issue #201 remains open.
