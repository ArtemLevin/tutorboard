# C3.9-S5.4 — pixel root-cause investigation and fidelity gate

Date: 2026-10-11. Issue: #201. Draft PR: #224 (incremental to S5.3 Draft #222). Main stays at `8a24b882b2a84472bc530691e47171a7775e74a6`.

## Experiments actually performed

### Full TutorBoard 320-ink + 10-image scene

[Chromium / Firefox diagnostic run #38134813548](https://github.com/ArtemLevin/tutorboard/actions/runs/38134813548) tested real TutorBoard mounting from JSON, Konva cache activation in an experimental `c39-s5-a2` build, DPR1 / DPR2 screenshot differences, original selection and real document clear / undo / local persistence. **2/3 tests passed per browser**; strict A0↔A2 RGBA remained FAIL (by design). The test workflow ran browser installs/build, zero test retries.

- **DPR1:** A0↔A2 full 1240×820 scene had **zero changed pixels** in both Chromium and Firefox.
- **DPR2:** A0↔A2 full 2480×1640 image had **4 different pixels** in Chromium (max per-channel delta 1) and **5 different pixels** in Firefox (max delta 2). A0↔A0 across independent contexts had zero changes. This behavior matches prior #38126279584 and is reproducible.
- Exact Chromium positions (physical px): (433,318), (434,318), (322,967), (316,968). Firefox: (433,318), (434,318), (274,319), (1113,1015), (1114,1015).
- Clear then Ctrl+Z restored original document count and the persisted state reached "Сохранено локально"; after clear, retained A2 wheel-cache count was zero. This is an actual UI/history/storage smoke, **not exhaustive eraser/redo or server collaboration verification**.
- In the strict pixel test, an actual BoardStage selection flow with the original Konva shapes executed without its own assertion failing, but does not assert every node's hit identity.

### Isolated original Konva 10.3.0 stage

[Single-stroke two-browser run #38134813547](https://github.com/ArtemLevin/tutorboard/actions/runs/38134813547) passed both Chromium and Firefox with native Konva `Group.cache` and `getIntersection`. Cases tested a real Konva Line, one fractional line coordinate, opacity 1 and 0.5, crop x/y with 0 or 0.5 CSS-px offset and DPR 1/2:

- For integer crop and DPR1, all probes produced **0 changed pixels**.
- For crop shifted by 0.5 CSS px at DPR1, **886–910 changed pixels** in the single-Line tests, max channel delta 255, despite matching `getIntersection` IDs. This demonstrates that fractional crop-origin changes can alter pixel sampling materially.
- At DPR2, all isolated one-Line cases had zero changed pixels and matching original hit IDs, including half-pixel crop origins and semi-transparent strokes.

[Two crossing Lines follow-up run #38134945084](https://github.com/ArtemLevin/tutorboard/actions/runs/38134945084) also passed Chromium and Firefox: 16 permutations per browser, same DPR/opacity/crop matrix. DPR1 crop shift had **1669–1710 changed pixels**, but integer crop remained exact. All DPR2 permutations were pixel-exact, and original hit IDs matched. Overlapping Lines and opacity alone therefore **do not reproduce** the 4–5-pixel discrepancy seen with the real BoardStage's vector-ink `Konva.Path` trees.

## Assessment

**S5.4 remains a strict NO-GO for A2.** There is a reproducible DPR2 discrepancy specific to full production pen/path rendering or compositing, which the one/two Line reduction failed to reproduce. The direct cause inside Konva has **not** been established; speculation about anti-aliasing, raster cache origin, temporary offscreen pixel quantization or path compositing must not be represented as a verified fix.

We retain strict `changedPixels <= A0/A0 changedPixels` and `maxChannelDifference <= A0/A0 max`; A0/A0 baseline noise is zero in both browsers. We have not weakened the assertion and have **not** run the 5k/10k A0/A2 paired performance gate.

## Next mandatory engineering work

1. Reduce a **real generated vector-ink SVG Path** from the 320-stroke C3.9 fixture, preserve original `createPenStrokeRenderPaths` opacity/path data and the actual 2480×1640 DPR2 stage transform; add one Path at a time until the first changed pixel appears. Compare canvas scene pixels vs compositor and original hit keys.
2. Identify whether the first divergent pixel arises from `Konva.Group.cache` draw into offscreen scene, from offscreen `drawImage` compositing, or from independent sibling paths/groups; validate crop integer boundary and world-coordinate rounding. Apply a bounded production-safe solution or record a path-specific opt-out with true candidate activation.
3. Complete separate browser gates: affected stroke hit ID and z-order at changed pixels, partial eraser/undo/redo, selection drag, 48-wheel memory cycle, clear/persist/reopen, collaboration permission/reconnect/revoke, both DPR and browser engines.
4. Only after strict S5.4 fidelity **PASS**, freeze a single candidate SHA and run the 2-independent-runner ABBA p95 profile for 5k/10k plus 10 real PNG/JPEG media. Stop if the bounded 256-stroke candidate lacks material active p95 benefit.

## Files and checks

- Modified `tests/e2e/c39-s5-crop-fidelity.spec.ts`: DPR1/DPR2 and real clear/undo/local persistence.
- New `tests/e2e/c39-s5-subpixel-probe.spec.ts`: native Konva 10.3.0 scene/hit synthetic repro, expanded from one stroke to overlapping semi-transparent Lines.
- New `.github/workflows/c39-s5-s4-subpixel.yml`: two-browser CI reproducer and archived raw logs.
- The strict pixel gate failed intentionally. Synthetic probes passed. Final candidate branch CI and formatting must be checked for the current branch head; a short-lived formatter workflow was used for the new files.
- Existing production main remains unchanged; Draft PR #222 and Draft PR #224 stay unmerged, Issue #201 open.

**Scope limitation:** The requested comprehensive eraser and real-time collaboration gates have not been completed, and the pixel root cause has not yet been corrected. S5.4 release status is therefore **NO-GO**.


## Addendum — original hit owner changes on fractional native Path crop

[Native Path extension run #38135448461](https://github.com/ArtemLevin/tutorboard/actions/runs/38135448461) tested original Konva 10.3.0 Path with a filled vector-ink-style SVG path above two crossing Lines in the same Group. Under all 16 DPR/opacity/crop permutations per browser, **integer crop retained exactly the original sampled hit IDs and pixels**. For `cropShift=0.5`, the first sampled hit changed from original `canonical-pen` to the different original node `vector-ink-path` in both Chromium and Firefox, **including DPR2 when sampled RGBA differences were zero**. At DPR1 the same fractional crops also changed 2,099–2,148 pixels, max channel 255. The run correctly failed the previous all-crops hit equality gate; the revised test now explicitly asserts the supported integer crop's identity and the known fractional-crop failure mode. This is a meaningful hit-testing hazard. The guarded S5.3 candidate already snaps raster crop x/y to integer CSS values and must keep that contract. The production 4/5 DPR2 pixel mismatch persists even with integer bounds, so its precise root cause remains open.

A separate full BoardStage pen undo/redo test initially failed to create the new pen after document import because the UI was left in a different focus/tool state; the test was updated to select the Pen tool explicitly through its menu. Its outcome must be verified on the new SHA before reporting pass.

Current S5.4 release decision remains **NO-GO**; performance ABBA blocked and real server collaboration/partial eraser gates outstanding.
