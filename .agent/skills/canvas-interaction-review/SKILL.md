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
4. Verify that preview is runtime-only and one gesture commits one command.
5. Check pointer capture release and locked/read-only behavior.
6. Route pure math to unit tests and lifecycle behavior to real-browser tests.

# Blocking conditions

- Pan or zoom changes object coordinates.
- Renderer writes to store directly.
- Preview enters `BoardDocument`.
- Cancel commits a partial object.
- Delta depends on zoom or DPR.
- Pointer capture can remain active after loss/unmount.

# Output

Return state transitions checked, coordinate spaces, invariant IDs,
counterexample scenarios, selected tests, findings, and residual browser risk.

