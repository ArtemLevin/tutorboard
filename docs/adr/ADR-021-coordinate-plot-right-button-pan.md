# ADR-021: Right-button pan inside coordinate plots

- Status: Accepted
- Date: 2026-08-02
- Scope: pointer routing between an active coordinate plot and the board viewport

## Decision

1. Right-button pointerdown inside an actively edited coordinate plot starts an internal viewport-pan session.
2. The plot captures the pointer and converts client movement into local plot-pixel deltas.
3. The event is consumed before BoardStage can start its global right-button pan session.
4. Pointerup, pointercancel, window blur, editor close and component cleanup release capture and clear cursor state.
5. Existing left-button drag, wheel zoom and touch pinch behavior remain available.

## Verification

A browser regression test creates a plot, drags its canvas with the right button, saves the draft and verifies three outcomes: the coordinate viewport changes, the board viewport stays equal to its original value and the plot object's board position stays equal to its original value.
