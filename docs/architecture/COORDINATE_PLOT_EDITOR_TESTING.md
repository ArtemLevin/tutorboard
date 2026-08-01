# Coordinate plot editor verification

## Automated coverage

The PR 5 gate verifies:

- default coordinate-plane creation;
- explicit and parametric series operations;
- shared parameter creation and validation;
- expression diagnostics;
- fit-to-series and viewport reset;
- pointer-anchored pan and zoom calculations;
- React panel callbacks and save availability;
- App creation, stale-safe save and semantic undo;
- Chromium and Firefox creation of two series followed by JSON export;
- the existing board, GeometryOS, Smart Ink, production image and security gates.

## Manual smoke sequence

1. Start TutorBoard and choose **График**, or press `G`.
2. Confirm that a coordinate plane with `y=x^2` appears and the editor opens.
3. Change the formula, add a parametric circle and add a shared parameter.
4. Drag inside the plot to pan the internal viewport.
5. Use the wheel to zoom, Shift-wheel for X and Alt-wheel for Y.
6. Select a curve and its legend row; confirm the same series stays selected.
7. Choose **Сохранить**, close the editor and use undo/redo once.
8. Reload the saved document and confirm formulas, ranges, parameters and viewport values.
9. Repeat the interaction in Chromium and Firefox.

The outer board Transformer stays unavailable while internal plot editing is active. `Escape` closes the transient session without committing its current draft.
