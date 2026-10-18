# Stroke styles

TutorBoard stores the optional `ObjectStyle.strokeStyle` token in BoardDocument 1.0. Missing values retain legacy rendering. The nine tokens are thin, thick, dashed, dash-dot, wavy, hand-pencil, hand-pen, marker, and oil-paint.

`hand-pencil` uses three deterministic passes with independent contour jitter, graphite-like opacity, and a fine broken grain pass. `hand-pen` uses a confident primary pass plus a lighter displaced pass, producing a sketchbook ink contour. These effects cover lines, pen strokes, rectangles, ellipses, and Smart Ink replacements.

`marker` uses the selected stroke color with a wide square-ended contour and reduced opacity. It remains editable through the same selection style command and participates in undo/redo.

`oil-paint` is a pressure-sensitive, broad, layered vector brush. It combines an irregular opaque impasto body with a displaced translucent ridge and a sparse bristle track. The three passes are capped and deterministic, use the selected stroke color, and follow the existing stylized-stroke pipeline for preview, final rendering, bounds, editing, and SVG/PNG export. The default width is 12, editable through the ordinary stroke-width control. A single-sample dab remains visible through the standard pressure-aware dot geometry.

Custom paths are deterministic functions of object geometry. No random state is serialized or generated at render time, preserving collaboration, replay, undo/redo, and export consistency. Smart Ink replacements inherit the source object style and remain editable through the selection inspector.
