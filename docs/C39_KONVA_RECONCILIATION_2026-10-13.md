# C3.9 — React-Konva reconciliation and idle Transformer candidate

2026-10-13. Reference: merged #256, main SHA `82baf7d86df0b2bbac4d89498484e385f2e5303b`, Issue #201.

## Evidence

Three repeated Chromium DPR2 runs with 10,000 strokes, 4 PNG and 6 JPEG:
visibility select P95 ~1.4 ms, Transformer sync P95 ~30–45 ms, Konva
scene/hit redraws ~55–115 ms, and `LayerTreeHost::DoUpdateLayers`
up to 265 ms. These phases overlap and cannot be added together.

## Controlled probes

- `react-descriptors-build` measures synchronous creation of React child
  element descriptors per scene run. It excludes child Fiber renders.
- `konva-attr-apply` records an opt-in bounded *aggregate* of update calls
  to Konva Node.setAttrs (count and sumMs). The event duration is zero
  because sumMs is non-contiguous and must not be treated as a frame span.
- `konva-scene`, `konva-hit` and aligned Chromium compositor events
  retain the previous independent draw/paint evidence.

Node prototype wrapping is only active for an opt-in traced BoardStage and
is restored on unmount. It may perturb measured performance; assess
trace-on/off observer distortion before attributing small gains.

## Isolated optimization and safety

The Transformer effect formerly called `stage.find(".board-transform-target")`
every viewport update regardless of selection. The candidate skips it only
when there are zero selected transformable objects and zero attached nodes.
Active selection, new selection and deselection with stale attached handles
all retain the original query, .nodes() update and redraw.

No changes to document schema, persistence, collaboration, hit targets,
layers or scene drawing. Existing pen/eraser and undo/reconnect contracts
still require browser tests. This is a Draft candidate: GO only after two
independent runners demonstrate >=20% paired active P95 improvement at
both 5k and 10k strokes with ten static images, no >100ms tail regression,
pixel/hit parity, memory and user-workflow evidence.
