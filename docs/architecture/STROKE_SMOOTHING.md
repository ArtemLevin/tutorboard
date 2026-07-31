# Stroke smoothing

Freehand `drawing.pen-stroke` objects retain their original BoardDocument points. Rendering uses deterministic resampling and Catmull–Rom interpolation from `src/shared/stroke-smoothing.ts`. Detail increases in quarter-step zoom buckets through the canvas maximum, while bounded point budgets protect responsiveness.

The shared implementation serves Konva and document snapshots. Pencil and pen sketchbook passes use a smoothed support curve. Marker strokes use the same support curve with their wide translucent style. Wavy and hand-drawn line sampling increases with zoom. Strict geometric primitives retain exact geometry. Cached results are keyed by the immutable source point array and zoom bucket.
