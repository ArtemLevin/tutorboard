# ADR-019: Coordinate plot canvas navigation and mobile editor

- Status: Accepted
- Date: 2026-08-01
- Scope: `math.coordinate-plot` interactive renderer and editor

## Context

The coordinate-plot editor already supports internal pointer pan and wheel zoom, yet those capabilities are difficult to discover. Axis-specific zoom depends on modifier keys, touch devices lack a two-finger gesture, the mobile editor occupies a bottom sheet, renderer status markers have no user-facing explanation, and a large visible-series set can make the legend exceed the plot frame. Release evidence also lacks deterministic viewport screenshots.

## Decision

1. Add a visible DOM navigation toolbar during coordinate-plot editing with zoom in, zoom out, reset and fit actions.
2. Store `XY`, `X`, or `Y` zoom-axis mode as transient editor-session state and apply it consistently to toolbar, wheel, trackpad and pinch input.
3. Keep `Shift` and `Alt` as temporary X-only and Y-only overrides.
4. Show `grab` over the internal pan surface and `grabbing` during drag or pinch.
5. Implement two-touch pinch by combining distance-ratio zoom around the initial local midpoint with midpoint-displacement pan.
6. Use a fixed full-viewport editor at narrow mobile widths with safe-area padding, sticky structural controls and independently scrolling content.
7. Explain sampled, truncated, invalid and aborted renderer states in the View tab while retaining compact canvas markers.
8. Bound legend width and height, render a maximum of eight visual rows and reserve the final row for an overflow summary when required.
9. Add a committed Playwright visual-regression matrix for Chromium desktop, Firefox desktop, Chromium mobile portrait and Chromium mobile landscape.
10. Keep BoardDocument `1.1`, expression, sampler, renderer cache and semantic update-command contracts unchanged.

## Consequences

- Navigation controls and axis mode are accessible without relying on modifier keys.
- Touch navigation updates only the transient draft until the existing save action commits it.
- Mobile editing uses the entire viewport and preserves draft-safety and focus-management guarantees from ADR-017.
- Large legends remain inside the coordinate plane, with hidden-row count made explicit.
- Screenshot baselines become release artifacts and require intentional updates when visual behavior changes.
- The coordinate-plot production CI job gains a visual matrix and failure artifacts.