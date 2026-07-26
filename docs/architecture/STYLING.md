# Style inspector

The selection style command accepts a partial base style: fill, stroke,
stroke width, and opacity. It validates the complete document after applying
the patch and rejects invalid numeric ranges, oversized values, or locked
selections atomically.

User objects receive the patch in `BoardObject.style`. GeometryOS objects keep
their imported base style unchanged; the same command writes a per-object
`GeometryImportRecord.visualOverrides[].style` patch. The scene selector merges
that override for rendering, so visual customization never mutates canonical
GIR or reconstructs mathematical semantics.

One mixed selection can contain both ownership modes while remaining one
history item. Serialization tests cover base styles and GeometryOS overrides;
the browser inspector exposes fill, stroke, stroke width, and opacity using
labeled controls.
