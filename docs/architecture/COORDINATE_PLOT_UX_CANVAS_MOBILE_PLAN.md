# Coordinate plot canvas navigation and mobile UX plan

## Goal

Complete UX PR 3 for `math.coordinate-plot` by making internal canvas navigation visible, predictable and touch-capable, while giving the editor a production mobile layout and adding deterministic visual-regression evidence. BoardDocument remains `1.1`; every navigation mode, gesture session and editor layout choice remains transient UI state until the existing save command commits the edited definition.

## Scope

### 1. Visible canvas navigation

While a coordinate plot is being edited, the workspace exposes a DOM toolbar with:

- zoom in;
- zoom out;
- reset to the default viewport;
- fit visible series;
- zoom-axis mode: `XY`, `X`, or `Y`.

The toolbar uses normal buttons and a radiogroup so keyboard and assistive-technology users have the same controls as pointer users. Zoom buttons operate around the plot center. Reset and fit reuse the existing editor model helpers.

### 2. Axis-aware zoom

The selected axis mode is transient editor-session state. It applies to:

- visible zoom buttons;
- wheel zoom;
- trackpad zoom;
- two-finger pinch.

`Shift` temporarily requests X-only zoom and `Alt` temporarily requests Y-only zoom. Axis-specific zoom releases equal-scale locking through the existing viewport helper.

### 3. Pointer affordance

The internal plot pan surface displays:

- `grab` while available for panning;
- `grabbing` during an active drag or pinch;
- the surrounding board cursor after the pointer leaves the plot.

Single-pointer dragging keeps the current pointer-anchored pan contract. Gesture cleanup runs for drag end, touch end, cancellation and component unmount.

### 4. Pinch-to-zoom

A two-touch gesture captures the initial local midpoint, distance and viewport. Each move:

1. derives a bounded zoom factor from the distance ratio;
2. zooms around the initial midpoint using the selected axis mode;
3. pans by the midpoint displacement so the content follows both fingers;
4. updates the transient draft viewport through the existing interaction callback.

The canvas prevents browser scrolling or page zoom only while the plot gesture is active.

### 5. Full-screen mobile editor

At narrow mobile widths the coordinate-plot editor becomes a fixed full-viewport surface:

- `100dvh` height with safe-area insets;
- no rounded outer frame;
- sticky header, tab bar and footer;
- independently scrolling tab content;
- 44-pixel minimum touch targets;
- two-column controls collapse to one column where required;
- close confirmation remains contained inside the editor.

Tablet and desktop layouts retain the floating editor.

### 6. Renderer status explanation

The View tab contains a status glossary:

- **Построено** — the complete sampled result is shown;
- **Лимит детализации** — safe point or evaluation limits shortened refinement;
- **Ошибка** — the formula, domain or range could not be evaluated;
- **Отменено** — an obsolete render was cancelled after a newer update.

The legend keeps compact status markers and the glossary explains their meaning in user language.

### 7. Bounded legend

Legend layout is constrained by both plot dimensions and release caps:

- width is capped relative to plot width and by an absolute maximum;
- height is capped relative to plot height;
- at most eight visual rows are rendered;
- an overflow row displays `Ещё N` when additional visible series exist;
- every rendered row remains selectable.

The renderer never places the legend outside the plot frame.

### 8. Visual regression matrix

A dedicated Playwright visual suite records stable snapshots for:

1. Chromium desktop, 1440 × 900;
2. Firefox desktop, 1440 × 900;
3. Chromium mobile portrait, 390 × 844;
4. Chromium mobile landscape, 844 × 390.

The matrix covers the navigation toolbar, bounded legend, renderer-status glossary, Functions tab, View tab and full-screen mobile editor. Animations and caret rendering are disabled for snapshots. Baselines are stored in the repository and checked in the coordinate-plot production gate.

## Verification

Unit tests cover:

- center-based axis zoom;
- pinch zoom with midpoint translation;
- malformed gesture protection;
- bounded legend rows and overflow counts;
- status labels;
- renderer interaction axis propagation;
- navigation-toolbar callbacks and radiogroup semantics;
- mobile editor class and status glossary.

Browser tests cover:

- visible zoom/reset/fit controls;
- XY/X/Y mode changes;
- plot `grab` and `grabbing` cursor transitions;
- synthetic two-touch pinch;
- durable save and reload after navigation;
- mobile full-screen geometry;
- visual regression matrix.

## Completion criteria

- quality, unit, integration, performance and architecture gates pass;
- Chromium and Firefox lifecycle tests pass;
- all visual snapshots match their committed baselines;
- Smart Ink, GeometryOS and production-image gates remain green;
- review comments and review threads are resolved;
- the PR is squash-merged into `main`.