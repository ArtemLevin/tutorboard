# Hotfix plan: coordinate-plot right-button gestures

- Issue: #67
- Base: merge commit `c989b4da5c5ef4bf361a80377809444fa3edc6c4`
- Severity: P0

## Goals

1. Restore right-button panning inside a coordinate plot while its settings panel is closed.
2. Preserve board panning on the background and on ordinary board objects.
3. Keep object settings behind a stationary right-button double-click.
4. Keep a stationary single right click free of tool-selection side effects.
5. Commit one semantic history item for one completed direct plot-pan gesture.
6. Restore the complete browser and release gate before merge.

## Gesture ownership

### Coordinate plot

`CoordinatePlotRenderer` owns every right-button gesture whose pointerdown target is inside the plot:

- movement at or below 8 px remains a click candidate;
- a second stationary click within 450 ms opens plot settings;
- movement above 8 px starts internal coordinate-viewport panning;
- pointerup commits the final viewport exactly once when the editor is closed;
- pointercancel, blur and unmount revert an uncommitted preview;
- plot events stop before `BoardStage` receives them.

### Board stage

`BoardStage` owns right-button gestures on the board background and ordinary objects:

- stationary double-click on an object opens its inspector;
- movement above 8 px starts board panning;
- the navigation tool is activated only after the drag threshold is crossed;
- a stationary single click leaves the active tool unchanged.

## State and history

- During direct plot panning, the renderer keeps a transient viewport preview.
- On pointerup, `App` sends one `core.coordinate-plot.update` command with the original definition as `expected` and the final viewport as `replacement.coordinateViewport`.
- The preview and committed document update are completed in the same pointerup batch, preventing a one-frame snapback.
- Editor-open navigation continues to update the editor draft and remains part of the explicit editor save workflow.

## Verification matrix

### Unit and integration

- Board right-pan threshold delays navigation-tool activation.
- Direct plot viewport commit creates one history item.
- Stale and locked plot updates remain rejected by the reducer.
- Renderer wiring exposes settings, draft viewport changes and direct viewport commits through distinct callbacks.

### Browser

Chromium and Firefox must verify:

1. right drag inside a plot with the editor closed changes the plot viewport;
2. board viewport and plot position stay fixed;
3. one undo restores the pre-drag viewport;
4. single stationary right click leaves the active tool unchanged;
5. right double-click opens the plot editor;
6. right double-click opens figure settings;
7. right drag on background pans the board;
8. existing inspector-dependent scenarios explicitly open settings through the new gesture.

### Release

Merge is allowed only after these checks succeed:

- Quality gate;
- Browser smoke;
- Coordinate plot production gate;
- coordinate plot visual matrix;
- GeometryOS live browser contract;
- Smart Ink production gate;
- Production image.

## Cleanup

The hotfix removes the merged debug workflow and trigger file from `main`.

## Verification record

The implementation has passed the preliminary and focused gates in GitHub Actions:

- Prettier formatting;
- ESLint with zero warnings;
- TypeScript project typecheck;
- 90 Vitest files and 425 tests;
- production Vite build;
- Smart Ink production behavior in Chromium and Firefox;
- coordinate-plot functional lifecycle in Chromium and Firefox;
- coordinate-plot visual regression matrix, including mobile landscape;
- GeometryOS live browser contract;
- focused Chromium and Firefox smoke for board background pan, figure contour settings and high-zoom stroke settings.

The final complete release matrix remains mandatory before the pull request can leave draft status.
