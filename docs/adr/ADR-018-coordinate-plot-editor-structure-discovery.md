# ADR-018: Coordinate plot editor structure and discovery

- Status: Accepted
- Date: 2026-08-01
- Scope: `math.coordinate-plot` editor UI

## Context

The first production editor exposed every coordinate-system, series, style and parameter control in one long scrolling panel. The interface was technically complete, yet users needed to understand where parameters lived, how formulas were written and what internal enum values meant. An unknown identifier diagnostic identified a problem without offering the direct corrective action.

## Decision

1. Organize editor controls into the transient tabs **Функции**, **Параметры** and **Вид**.
2. Implement the WAI-ARIA tab pattern with arrow, Home and End keyboard navigation.
3. Keep formulas as plain `tutorboard-expression/1` source while adding contextual quick insertion actions for `sin`, `cos`, `sqrt`, `abs` and `pi`.
4. Insert functions at the active selection or caret and return focus to the edited formula.
5. Provide a concise syntax reference and state explicitly that trigonometric functions use radians.
6. Turn an actual `expression.unknown-identifier` diagnostic into an inline parameter-creation action when the diagnostic range contains a valid parameter identifier.
7. Create the requested parameter through the existing ID factory and parameter limit, then switch to the parameters tab and focus the new name field.
8. Localize series kinds, line styles, legend positions and visible range labels while retaining the stored enum values.

## Consequences

- BoardDocument remains `1.1`.
- The expression language, renderer, sampler and semantic save command remain unchanged.
- Tab selection and focus targets remain transient UI state.
- Existing draft-safety and accessibility behavior from ADR-017 remains mandatory.
- Tests must cover keyboard tabs, quick insertion, unknown-parameter creation, localized options and the Chromium/Firefox lifecycle.
