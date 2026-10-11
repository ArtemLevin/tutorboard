# C3.9-S5.1 — Konva native cache: hit-graph and z-order feasibility

Date: 2026-10-11. Issue: https://github.com/ArtemLevin/tutorboard/issues/201.
Base main: 8a24b882b2a84472bc530691e47171a7775e74a6.
Research PR: https://github.com/ArtemLevin/tutorboard/pull/220.

## Completed browser experiment

For tested commit b7d101c9f6e5601c8df23bec30a851ba604f2c32, the dedicated
[Actions run #38122069516](https://github.com/ArtemLevin/tutorboard/actions/runs/38122069516)
reported **3 of 3 tests passed in Chromium and 3 of 3 tests passed in Firefox**,
with zero retries. Browsers: Chrome for Testing 149.0.7827.55 and Firefox 151.0.
The dynamically injected UMD code is supplied by the exact pinned local Konva
10.3.0 package. Tests use a separate temporary Konva Stage above the built
TutorBoard app. Production rendering, BoardDocument, permission logic and storage
were not modified.

Observable probes in tests/e2e/c39-s5-s1-konva-feasibility.spec.ts:

1. **Contained run and original node ownership:** two semi-transparent pen strokes
   share one Group, followed in the original Layer by a decoded PNG Image, and
   then another pen-run. A single bounded crop (x=8, y=39, width=147, height=51)
   fully contains the first run. At six probe pixels, original cached and restored
   hit IDs match (including pen-on-PNG overlap). The stage still holds precisely
   four original board-object nodes, and Transformer.nodes()[0] points to the
   original red pen node. Cached RGBA channel error is <=3 on these specific
   pixels; after clearCache, sampled channel difference is exactly zero.
2. **Crop of a crossing stroke:** a single original stroke from x=16 to x=286
   has hits at x=38 and x=246 before cache. A cropped native Group.cache
   covering x=0..120 causes the right hit to disappear; an alternative
   x=160..310 crop causes the left hit to disappear. Releasing each cache
   restores both hit locations on the **same** original node.
3. **Invalidation:** with clearCache before transform, an original pen node moves,
   returns and moves again, maintaining the expected original hit identity.
   These are *visual undo/redo-style transforms*; they do not exercise the
   actual TutorBoard history reducer, Dexie storage or eraser.

## Gate decision

**LIMITED GO:** Native Konva Group.cache is feasible for **one entirely
contained, contiguous pen-only run** when objects preceding/following the run
remain in the same original z-order and the cropped group contains all its
geometry and hit extents. This statement is limited to the tested DPR1 geometry,
alpha samples, decoded PNG and original node/Transformer identities.

**NO-GO for naive multi-tile crop of a crossing run:** Caching the same long
run inside one crop removes out-of-crop scene and hit; clearing the cache
restores it. The multi-tile adapter that could replay crossing geometry while
preserving a single canonical hit owner remains **unproven**. Duplicating live
nodes or disabling hit must not be accepted as a workaround.

No latency or memory gains were tested, and this is no evidence of A2 viability
at 5k/10k strokes. Multiple tile boundaries, DPR2, arbitrary transforms, exact
full-frame pixel equivalence, actual erasing, persisted undo/redo, collaboration
and lifecycle correctness remain for dedicated future gates.

## Next technical block

S5.2 may build a conservative selector for **one fully contained bounded pen
subrun** plus vector fallback for everything else, without changing object
order. A run is eligible only when every stroke and its conservative halo fit
the crop. Keep the existing 4 million physical-pixel limit, unify scene/hit
and scratch budget with WheelInkCache, prepare only at idle, invalidate at any
edit/undo/redo/board change, and release on clear/revoke/unmount.

Before committing to S5.3 or running paired A0/A2, verify that at least one
candidate run can activate within actual 5k/10k plus ten-image fixtures;
otherwise record a scoped NO-GO and investigate a separate multi-tile
hit-preserving adapter. The S5 A0/A2 release threshold remains >=20% paired
active-p95 improvement on each runner at both 5k and 10k with no behavior or
resource regressions. Issue #201 remains OPEN and main is untouched.
