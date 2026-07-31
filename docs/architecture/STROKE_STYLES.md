# Stroke styles

TutorBoard stores the optional `ObjectStyle.strokeStyle` token in BoardDocument 1.0. Missing values retain legacy rendering. The eight tokens are thin, thick, dashed, dash-dot, wavy, hand-pencil, hand-pen, and marker.

`hand-pencil` uses three deterministic passes with independent contour jitter, graphite-like opacity, and a fine broken grain pass. `hand-pen` uses a confident primary pass plus a lighter displaced pass, producing a sketchbook ink contour. These effects cover lines, pen strokes, rectangles, ellipses, and Smart Ink replacements.

`marker` uses the selected stroke color with a wide square-ended contour and reduced opacity. It remains editable through the same selection style command and participates in undo/redo.

Custom paths are deterministic functions of object geometry. No random state is serialized or generated at render time, preserving collaboration, replay, undo/redo, and export consistency. Smart Ink replacements inherit the source object style and remain editable through the selection inspector.
