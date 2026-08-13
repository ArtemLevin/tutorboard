# TutorBoard UI/UX remediation plan

## Goal

Make the board understandable without prior knowledge of shortcuts or hidden
gestures, preserve the compact chrome, and bring keyboard, touch, read-only and
collaboration workflows to the same quality level as the coordinate-plot
editor.

## Product decisions

1. Keep the separate **Shapes** dock icon removed. Rectangle, ellipse and
   regular polygon belong to the visible **Drawing** menu instead.
2. A single click selects an object and exposes its contextual controls.
   Right-button double-click remains a compatibility shortcut, not the only
   way to edit.
3. Creating a coordinate plot opens its editor immediately. Existing plots can
   be edited from the selection surface or context menu.
4. A click on empty canvas never changes the active tool implicitly.
5. The board keeps compact chrome but exposes a small document/sync/read-only
   status control for lesson-bound and read-only sessions, plus a first-use
   empty state.

## Implementation workstreams

### 1. Discoverability and interaction

- expose every drawing tool in the Drawing menu;
- open contextual selection controls after ordinary selection;
- add an explicit Edit action to selection controls and the context menu;
- open the graph editor after graph creation;
- remove implicit Smart Ink and Selection mode switching from blank-canvas
  clicks;
- add concise first-use instructions to an empty board.

### 2. Keyboard and assistive technology

- move focus into opened dock menus and support Arrow, Home, End and Escape;
- trap and restore focus in board settings, destructive confirmation, graph
  dialogs and the 3D editor;
- suspend board-level shortcuts while a modal surface owns interaction;
- expose command failures visually and through live regions;
- avoid advertising canvas application mode as a complete accessible object
  model; retain a named focusable canvas and keyboard shortcuts.

### 3. Read-only and collaboration clarity

- disable every mutating dock, selection, layer and document operation in
  read-only mode while preserving navigation, copy and export;
- show document title, persistence/sync state and read-only state on the board;
- keep detailed lesson, participants and evidence controls in the settings
  sheet.

### 4. Visual system and mobile ergonomics

- define the missing shared design tokens used by handwriting and overlays;
- apply consistent surface, text, border, accent and danger tokens;
- make palette controls wrap correctly in the current dock and increase mobile
  targets;
- prevent context surfaces from colliding with the document status and mobile
  safe areas;
- replace raw feature-flag names in user settings with Russian labels.

### 5. Verification

- update unit and browser tests to the new explicit interaction contract;
- add coverage for visible shapes, keyboard menu focus, direct graph editing,
  read-only controls, command errors and modal focus behavior;
- run formatting, lint, typecheck, unit, performance, architecture and
  production-build gates.

## Acceptance criteria

- all creation and editing workflows are discoverable with a mouse or touch;
- no supported drawing tool requires a memorized shortcut;
- dock menus and modal surfaces are fully keyboard reachable;
- read-only users do not see apparently actionable mutation controls;
- persistence and command failures are visible without opening diagnostics;
- the board remains usable at 320 px width and under reduced-motion settings;
- the complete repository quality gate passes.
