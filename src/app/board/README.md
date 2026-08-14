# Board application composition

`src/app/App.tsx` is the board composition root. It owns only top-level React wiring, external `AppProps`, the current active tool, accessibility/chrome state and the connections between focused application controllers and views.

## Controllers

Controllers in `controllers/` own application workflows and may consume public contracts from `core`, `modules` and `adapters` as appropriate:

- `useBoardDocumentController` is the single document mutation/history boundary around `reduceBoardDocument`, read-only enforcement and local/collaborative undo callbacks.
- `useBoardSelectionController` owns transient selection state, movement/transforms, layers, grouping and selection-scoped text/style mutations.
- `useBoardDrawingController` owns drawing interaction plus Smart Ink auto-replacement/composite orchestration.
- `useBoardHandwritingController` owns the transient handwritten-function lifecycle, abort/stale-result protection, source-ink materialization and atomic graph replacement.
- `useCoordinatePlotController` owns coordinate-plot editor sessions and semantic viewport updates.
- `useBoardGeometryController` owns text-shape placement, GeometryOS request/cancellation and vertex constructions.
- `useBoardSolid3DController` owns 3D editor/section/learning command orchestration while the editor remains lazy-loaded by the view layer.
- `useBoardClipboardController` and `useBoardMediaController` own clipboard and image insertion workflows.
- `useLaserPointerController` owns ephemeral laser state only; it never mutates `BoardDocument`.
- `useBoardInteractionRouter` is the only cross-tool pointer/tool-switch router.
- `useBoardKeyboardShortcuts` adapts global keyboard events to controller actions.

## Views

Components in `views/` render the canvas, feature overlays, tool dock, settings, notifications, shortcuts and diagnostic test surface. They receive controller capabilities rather than reproducing application workflows.

## Invariants

- Keep `AppProps` compatible with `PersistedApp` and `SyncedApp`.
- All `BoardDocument` mutations cross `useBoardDocumentController`.
- Do not expose mutable React refs as controller APIs; use current-value accessors such as `getDocument()` / `getState()` where imperative event handling needs fresh state.
- Preserve cancellation and stale-result guards for asynchronous workflows.
- Keep 3D UI lazy-loaded.
- Do not import feature modules or technology adapters directly from `App.tsx`; architecture invariant `APP-001` enforces this for public feature contracts, while the existing architecture rules continue to reject deep imports.
