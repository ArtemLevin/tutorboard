# Coordinate plot editor: two-level UX plan

## Goal

Reduce the first-open visual and cognitive load while preserving the complete coordinate-plot feature set.

## Interaction contract

1. A right-button double-click opens a compact basic settings panel.
2. The basic panel exposes the primary explicit formula and one primary parameter slider.
3. A newly created coordinate plot starts with `f(x) = 2*x + a` and parameter `a` configured as `-10..10`, step `0.1`, value `1`.
4. Existing plots keep their full definitions. The basic panel edits the first explicit series and the first shared parameter when available.
5. Complex plots without an explicit series remain editable through the detailed editor and show a concise basic-state explanation.
6. The detailed editor opens from the basic panel as a separate modal dialog.
7. Returning from the detailed dialog keeps the shared draft intact.
8. Save, close confirmation, validation, history and undo semantics remain unchanged.
9. Escape closes the detailed dialog first. Escape from the basic panel starts the existing close flow.
10. Ctrl/Cmd+Enter saves from either level when the draft is valid and dirty.

## Basic panel content

- title and saved/dirty status;
- primary formula input labelled `f(x) =`;
- local formula diagnostics;
- primary parameter card with name, current value, slider and range endpoints;
- a compact action to add parameter `a` when no parameter exists;
- a summary when additional series or parameters exist;
- `Расширенные настройки`, `Закрыть`, and `Сохранить` actions.

## Detailed dialog content

The current full editor remains available inside a modal dialog:

- functions and parametric curves;
- all parameters and exact numeric ranges;
- domains and parameter ranges;
- series styling;
- coordinate viewport;
- grid, axes and legend;
- renderer status guidance.

The dialog uses the same draft object as the basic panel and returns to the basic panel without discarding edits.

## Accessibility

- preserve the complementary landmark for the basic panel;
- expose the detailed surface as `role="dialog"` with `aria-modal="true"`;
- move focus into the detailed dialog on open and return focus to the trigger on close;
- keep WAI-ARIA tabs and keyboard navigation inside the detailed dialog;
- keep close confirmation as a separate alert dialog;
- provide visible labels and output text for the parameter slider.

## Verification

### Unit and component

- new default formula and parameter;
- basic formula editing;
- slider updates the primary parameter;
- parameter `a` can be added from the basic panel;
- detailed dialog opens and closes while preserving the draft;
- detailed tabs and advanced controls remain available;
- save, close confirmation and keyboard shortcuts retain their semantics.

### Browser

- right double-click opens the compact panel;
- the detailed dialog opens only after the explicit action;
- formula and slider changes preview and save correctly;
- Chromium and Firefox cover the new flow;
- desktop, mobile portrait and mobile landscape visual snapshots are updated.

### Release

Merge requires the complete existing release matrix: quality gate, browser smoke, coordinate-plot production gate and visual matrix, GeometryOS live contract, Smart Ink production gate, and production image.

## Implementation record

The first implementation pass now contains the compact formula/parameter surface, shared draft state, modal detailed editor, default parameterized plot, focus routing, and migrated component coverage. The full repository CI run is the source of truth for the next correction pass.
