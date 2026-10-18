# Stroke styles

TutorBoard stores the optional `ObjectStyle.strokeStyle` token in BoardDocument 1.0. Missing values retain legacy rendering. The nine tokens are thin, thick, dashed, dash-dot, wavy, hand-pencil, hand-pen, marker, and oil-paint.

`hand-pencil` uses three deterministic passes with independent contour jitter, graphite-like opacity, and a fine broken grain pass. `hand-pen` uses a confident primary pass plus a lighter displaced pass, producing a sketchbook ink contour. These effects cover lines, pen strokes, rectangles, ellipses, and Smart Ink replacements.

`marker` uses the selected stroke color with a wide square-ended contour and reduced opacity. It remains editable through the same selection style command and participates in undo/redo.

`oil-paint` imitates a heavily loaded house-painter brush: a very broad opaque impasto body, an uneven translucent paint ridge, broken bristle marks, and gravity-aligned drips hanging from slower, pressure-loaded lateral swipes. All drips are deterministic closed subpaths of the primary contour, with a hard cap of 16 droplets, so the brush retains three renderer nodes per stroke even on long boards. Drip extents are included in the shared geometry bounds for culling, export, and selection. The style uses the existing selected color and persists only the existing `strokeStyle` token; there are no new document, collaboration, or storage fields. Default width is 18, adjustable with the normal stroke-width control. A single-sample dab forms a larger deposited paint blob. Closed paths omit gravity drips.

Custom paths are deterministic functions of object geometry. No random state is serialized or generated at render time, preserving collaboration, replay, undo/redo, and export consistency. Smart Ink replacements inherit the source object style and remain editable through the selection inspector.
