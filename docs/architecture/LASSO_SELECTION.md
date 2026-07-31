# Lasso selection

TutorBoard exposes `selection.lasso` as a first-class selection tool with shortcut `L`.

## Interaction contract

- Primary-button drag on empty canvas records a freeform polygon in world coordinates.
- Releasing the pointer closes the polygon and resolves objects whose rendered geometry intersects the area.
- Plain drag replaces the current selection.
- `Shift` adds matching objects to the current selection.
- `Alt` removes matching objects from the current selection.
- Modified `Shift` and `Alt` gestures prioritize the lasso polygon over selected-object Transformer controls.
- `Escape`, pointer cancellation, viewport changes and window blur restore the selection that existed before the gesture.
- Primary-button interaction on an object keeps direct selection and movement behavior.
- Right button, middle button and `Space` retain canvas panning behavior.

## Geometry contract

Selection uses transformed object geometry instead of only axis-aligned bounds:

- pen strokes and lines use their path segments;
- rectangles, text, embedded images and SVG objects use transformed contours;
- ellipses use a bounded sampled contour;
- group and GeometryOS visual transforms are applied in scene order;
- hidden objects are excluded;
- degenerate polygons are ignored.

An object matches when its path enters the lasso, its closed contour overlaps the lasso, or one closed polygon contains the other.

## Performance contract

The interaction reducer filters near-duplicate samples and caps a gesture at 4096 points. Geometry evaluation also normalizes finite points and enforces the same cap. Selection runs once when the pointer is released; the live gesture renders only the polygon preview.

## Compatibility

The lasso updates the existing `SelectionState`. Selected objects therefore continue through the established move, resize, rotate, styling, grouping, clipboard, delete, lock, persistence and collaboration paths.

The release gate exercises replace, additive, subtractive and cancellation journeys in Chromium and Firefox.
