# Coordinate plot UX structure and discovery plan

## Goal

Make coordinate-plot authoring understandable without prior knowledge of the editor's internal structure or expression language. The change reorganizes the existing controls, introduces contextual discovery actions and localizes technical enum values while preserving BoardDocument `1.1`, the expression language and the single-command save model.

## Information architecture

The editor exposes three tabs:

1. **Функции** — series list, selected-series formula, range, visibility and style.
2. **Параметры** — shared parameter creation, values, bounds and sliders.
3. **Вид** — viewport, grid, axes, labels and legend.

Tabs use the WAI-ARIA tab pattern with `tablist`, `tab`, `tabpanel`, `aria-selected`, `aria-controls` and keyboard navigation through Left/Right, Home and End. Tab choice remains transient editor UI state.

## Function discovery

Formula controls include:

- a concise syntax guide;
- quick insertion buttons for `sin`, `cos`, `sqrt`, `abs` and `pi`;
- insertion at the current selection or caret position;
- selection of the placeholder argument after inserting a function;
- a radians hint whenever trigonometric functions are relevant.

The expression source remains plain text and continues to compile through `tutorboard-expression/1`.

## Unknown parameter action

An `expression.unknown-identifier` diagnostic with a valid parameter-shaped token produces an inline CTA:

> Создать параметр «a»

The action:

- creates a shared parameter with the exact requested name;
- reuses the normal parameter ID factory and maximum-count limit;
- switches the active tab to **Параметры**;
- focuses the new parameter name field;
- disappears as soon as the expression compiles with that parameter.

Constants and reserved identifiers are excluded by the expression compiler, so the CTA is based only on an actual unknown-identifier diagnostic.

## Localization

User-visible values are localized without changing stored enum values:

- line styles: `solid`, `dashed`, `dash-dot`;
- legend positions: `top-left`, `top-right`, `bottom-left`, `bottom-right`;
- series kinds;
- viewport and range labels.

## Verification

Unit tests cover:

- default tab and tab switching;
- keyboard tab navigation;
- localized enum options;
- quick insertion at selection and caret positions;
- syntax and radians guidance;
- unknown-parameter CTA and exact requested name;
- transition to the parameters tab.

Playwright in Chromium and Firefox covers:

1. create a plot;
2. insert `sin` and `pi` using quick actions;
3. enter an unknown identifier;
4. create the parameter through the CTA;
5. verify the parameters tab and focused name field;
6. verify localized style and legend choices;
7. save and export the resulting definition.

## Completion criteria

- existing safety and accessibility behavior from ADR-017 remains intact;
- all quality, browser, coordinate-plot production, Smart Ink and production-image gates pass;
- review threads are resolved;
- the PR is squash-merged into `main`.
