# ADR-017: Coordinate plot editor safety and accessibility

- Status: Accepted
- Date: 2026-08-01
- Scope: `math.coordinate-plot` editor UI

## Context

The coordinate-plot editor provides live preview while keeping the persisted
BoardDocument unchanged until the user saves. Closing the editor, pressing
Escape, or replacing the active editing session could therefore discard a
substantial draft. The first production UI also exposed validation visually
without complete programmatic relationships between fields and diagnostics.

## Decision

1. Every dirty close request opens an `alertdialog` with three explicit
   outcomes: continue editing, discard and close, or save and close.
2. A dirty session cannot be silently replaced by an edit request for another
   coordinate plot.
3. `Ctrl+Enter` and `Cmd+Enter` save the current valid dirty draft from any
   focused control in the editor.
4. Opening the editor moves focus to the selected series formula. Closing the
   editor restores the element that opened it when that element still exists,
   with the workspace as a programmatic fallback.
5. Field-level diagnostics use stable IDs together with `aria-invalid` and
   `aria-describedby`.
6. Icon-only controls retain visible symbols while receiving explicit
   accessible names.
7. The panel provides a consistent `:focus-visible` treatment and touch-sized
   controls at the mobile breakpoint.

## Verification contract

- Unit tests cover initial and restored focus, all close decisions, keyboard
  save, ARIA diagnostic relationships, and icon-only accessible names.
- Playwright covers dirty Escape handling, draft continuation and discard,
  clean close after keyboard save, restored focus, and field diagnostics.
- The browser scenarios run through the repository Chromium and Firefox
  matrix together with the existing coordinate-plot production lifecycle.
- Strict TypeScript, ESLint, Prettier, architecture checks, production build,
  and the existing Smart Ink and image gates remain required.

## Consequences

- Live preview remains transient and BoardDocument schema `1.1` is unchanged.
- A save still creates one semantic `core.coordinate-plot.update` command.
- Escape becomes a safe close request instead of an unconditional discard.
- Keyboard and assistive-technology behavior is covered by unit tests and
  Playwright scenarios in the Chromium and Firefox browser matrix.
