---
name: canvas-interaction-review
description: >
  Review TutorBoard canvas coordinates, viewport transforms, rendering, pointer
  lifecycle, tools, selection, drag, resize, DPR, keyboard, touch, and pen
  interactions. Use for board/canvas code or UI behavior that can affect
  coordinates or committed commands.
---

# Purpose

Keep canvas runtime replaceable and ensure interactions cannot corrupt document
coordinates or leave partial state.

# Required context

Read `../../../PLAN.md` sections 6.3, 6.4, and 7.2, then inspect the affected
state machine, transform functions, and browser tests.

# Workflow

1. Model `idle -> capturing -> previewing -> committed|cancelled -> idle`.
2. Include pointer loss, window blur, tool switch, Escape, resize, unmount,
   readonly mode, and unsupported input.
3. Trace screen, world, geometry-local, and object-local conversions.
   - screen coordinates are CSS pixels; DPR is renderer-only;
   - subtract the canvas container bounds before converting browser client
     coordinates to world coordinates;
   - keep one viewport snapshot for the full captured drawing gesture;
   - `screen = world * zoom + offset`;
   - pan changes viewport offset by screen delta and never rewrites objects;
   - pointer-centred zoom preserves the anchored world point.
4. Verify that preview is runtime-only and one gesture commits one command.
   Coalesce a wheel burst before emitting one viewport intent.
5. Check pointer capture release and locked/read-only behavior.
6. Require canvas adapters to consume `BoardSceneReadModel`, never
   `BoardDocument`, commands, or reducers. The app composition root owns
   command metadata and commit.
7. For drawing, require the feature module to own the pure state machine,
   defaults and command factory. The adapter emits world-pointer intents and
   may render explicit runtime preview items, but cannot import the module.
8. Preserve the current stored schema: optional input such as pressure is not
   persisted until a version and migration decision exists.
9. For selection, require the feature module to own selected IDs, marquee and
   drag state, bounds and target normalization. The adapter may report a hit ID
   and render overlays, but selection and preview remain runtime-only. Moving a
   generic group updates its group transform exactly once.
10. Route pure math/state transitions to unit tests and capture, Escape, blur,
   tool-switch and pointer-loss behavior to real-browser tests.

# Blocking conditions

- Pan or zoom changes object coordinates.
- Renderer writes to store directly.
- Preview enters `BoardDocument`.
- Cancel commits a partial object.
- Delta depends on zoom or DPR.
- Pointer capture can remain active after loss/unmount.
- Canvas math depends on DPR or raw backing-store pixels.
- Renderer receives the mutable document/store instead of a scene read model.

# Output

Return state transitions checked, coordinate spaces, invariant IDs,
counterexample scenarios, selected tests, findings, and residual browser risk.
