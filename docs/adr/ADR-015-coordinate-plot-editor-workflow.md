# ADR-015 — Coordinate plot editor workflow

## Status

Accepted for the coordinate-plot PR 5 increment.

## Context

TutorBoard already stores coordinate plots as `BoardDocument 1.1` objects, evaluates formulas through `tutorboard-expression/1`, samples curves through `tutorboard-sampler/1` and renders them with the production Konva adapter. Users still need a complete workflow for creating a plane, editing series, controlling shared parameters and changing the internal viewport without confusing those actions with movement and scaling of the board object.

Formula input also needs immediate feedback. Invalid text must remain editable so a partially entered expression can be corrected while valid sibling series continue rendering.

## Decision

- Add a toolbar action and shortcut `G` that create a default `math.coordinate-plot` through `core.objects.add` and immediately open its editor.
- Open an existing plot through double-click, Enter on a selected plot or the selection inspector.
- Maintain one transient editor session containing the expected persisted definition, a live draft and the selected series identifier.
- Render the draft through `KonvaRenderContext.coordinatePlot`. Persist it through one stale-safe `core.coordinate-plot.update` command when the user chooses Save.
- Keep expression diagnostics advisory during formula entry. Structural definition issues block Save.
- Provide editors for explicit and parametric series, domains and ranges, visibility, line style, color, opacity and width.
- Provide shared named parameters with numeric inputs and optional bounded sliders.
- Provide controls for viewport bounds, equal scale, grid, axes, labels, legend, fit-to-series and standard viewport reset.
- Reserve drag and wheel gestures inside the clipping rectangle for internal pan and cursor-anchored zoom while the editor is active. Shift-wheel changes the horizontal range and Alt-wheel changes the vertical range.
- Disable board-object Transformer handles during internal editing. Escape closes the session and leaves the persisted definition unchanged.
- Keep BoardDocument, clipboard, sync and transfer schema versions unchanged.

## Consequences

A complete edit session contributes one semantic undo step. Collaborative stale checks remain active because Save carries the definition captured when the session opened. Formula typing and parameter-slider motion update the visual preview without flooding command history or server synchronization.

PR 6 can focus on final cross-browser persistence, recovery, synchronization and performance evidence. Future worker-backed sampling or parameter animation can reuse the same transient draft and renderer context contracts.
