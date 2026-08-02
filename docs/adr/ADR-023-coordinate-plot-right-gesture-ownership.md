# ADR-023: Coordinate-plot right-gesture ownership

- Status: Accepted
- Date: 2026-08-02
- Scope: right-button click, double-click and drag routing

## Decision

1. A coordinate plot owns every right-button gesture that starts inside its rendered bounds.
2. Movement above 8 screen pixels starts internal coordinate-viewport panning.
3. A stationary second click within 450 ms opens plot settings.
4. Plot events stop before the board-level recognizer.
5. Closed-editor panning uses a transient renderer preview and one core.coordinate-plot.update command on pointerup.
6. Editor-open panning updates the draft and remains part of the explicit save workflow.
7. BoardStage activates the navigation tool only after a board right drag crosses the same movement threshold.
8. Pointer cancellation, blur and unmount discard uncommitted previews and release capture.

## Consequences

The settings panel and direct graph navigation have independent state. A stationary right click carries no tool-switch side effect. Each target scope has one gesture owner, so board panning and plot panning cannot start from the same pointerdown.

## Verification

Chromium and Firefox cover closed-editor plot panning, atomic undo, unchanged board viewport and object position, stationary single-click behavior, right-double-click settings entry and background board panning.
