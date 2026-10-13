# C3.9 — critical path of large-board frames

Date: 2026-10-13. Related Issue [#201](https://github.com/ArtemLevin/tutorboard/issues/201), merged diagnostic PR #253 and draft prepared-viewport PR #255.

## Strict ABBA decision for #255

[Exact-head workflow 38384294082](https://github.com/ArtemLevin/tutorboard/actions/runs/38384294082) succeeded as a **test execution**, but measured **performance NO-GO**. Two fresh Chromium 149.0.7827.55 Ubuntu runners, three chronological ABBA cycles each (six matched pairs), 5k/10k strokes plus four PNG/six JPEG and DPR2:

| Scene | Runner 1 median paired active-P95 improvement | Runner 2 | Gate |
| --- | ---: | ---: | --- |
| 5k ink / 10 static images | -16.65% | +20.70% | NO-GO |
| 10k ink / 10 static images | +9.61% | -8.86% | NO-GO |

The criterion was >=20% speedup for *both* loads on *each* runner without tail regression. Repeat document parsing disappeared from the wheel reducer, yet browser frames did not meet the gate. Keep #255 Draft; **no production merge**, and leave Issue #201 open.

## Synchronous traces vs compositor events

Representative [static-heavy workflow 38384293863](https://github.com/ArtemLevin/tutorboard/actions/runs/38384293863) collected three Chromium runs of 10k strokes and ten media objects. Across them the five slowest frames per run contain rAF gaps ranging ~383–583 ms, while the viewport reducer is only ~0.3–0.5 ms. One 550 ms gap coincides with a 446.5 ms `board-commit` (wheel input to React layout), 51.9 ms synchronous Konva scene draw, 57.8 ms hit-canvas draw and a 197.4 ms `LayerTreeHost::DoUpdateLayers` event on the Chromium renderer main thread. These spans **overlap** and can belong to distinct renderer/browser threads. Do not add them together or claim one exclusive root cause.

An important untested path: `BoardStage` reselects visible items, partitions render runs and calls `stage.find(".board-transform-target")` from an effect depending on `previewViewport`. The existing trace measured the entire `board-commit` and whole layer `drawScene`/`drawHit`, but did not separately time index selection, batch and run grouping, or transformer traversal.

## This PR: no semantic changes

Instrument the following opt-in bounded spans using the existing `window.__tutorBoardC37Trace` recorder:

- `viewport-visibility-index` (scene revision/index creation)
- `viewport-visible-select` (visibility query on each viewport)
- `viewport-item-batches` (render-item partitioning)
- `viewport-paint-runs` (Konva committed-layer grouping)
- `viewport-scene-runs` (ink/non-ink child grouping)
- `viewport-transformer-sync` (Konva scene traversal/transformer update)

The record contains only phase kind, `performance.now()` and duration; no student content. Production without the opt-in collector runs the unmodified closures. Existing bounded 12,000-event cap and architecture boundaries remain. Existing trace-to-rAF/Chromium timestamp alignment still applies. The screenshot/interaction semantics are unchanged.

## Release checklist / next experiment

1. Run exact-head full CI and three full static-heavy Chromium runs, verify all phase events and trace-on/off observer distortion.
2. Correlate each >100 ms gap with the expanded phase spans, existing `board-commit`, `konva-scene`, `konva-hit`, `react-ink-run`, and Chrome `LayerTreeHost::DoUpdateLayers` / `DirectRenderer::DrawFrame` timestamps; report event *overlap* and missing attribution explicitly.
3. Use the resulting dominant repeated operation for exactly **one** isolated intervention in a subsequent candidate branch. For example, remove redundant transformer scanning **only if** selection-neutral frames prove significant cost, preserving object picking and active transform fidelity.
4. Compare the candidate against fixed main SHA via independent ABBA (>=5 pairs / >=200 active frames per arm; DPR2 5k/10k static media), strict pixels/hit, undo/reconnect and memory. Merge performance changes only when >=20% P95 improvement holds on both runners.
