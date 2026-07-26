# Deterministic clipboard

The clipboard is an application-owned, runtime-only `1.0` payload. Copying
captures objects in document z-order and expands the selected closure:

- selecting any user-group member copies the whole group;
- selecting any GeometryOS object copies the complete import root group,
  canonical GIR, raw response, mapping, visual transform, and overrides;
- partial GeometryOS provenance is never produced.

Paste receives its identifiers from the application boundary. The pure
clipboard module remaps every object, group, import, mapping, override, and
source back-reference. Ungrouped objects, user-group transforms, and GeometryOS
visual transforms receive the same 24-world-unit offset. Canonical GIR and raw
GeometryOS provenance remain byte-for-byte equivalent values.

`core.clipboard.paste` and `core.clipboard.cut` apply a complete content closure
atomically. The reducer validates collisions and the final `BoardDocument`
before exposing it. Consequently paste and cut each occupy one undo item.

The product keeps a private in-memory clipboard and exposes buttons plus the
standard `Ctrl/Cmd+C`, `Ctrl/Cmd+X`, and `Ctrl/Cmd+V` shortcuts. Board shortcuts
do not intercept editing surfaces.
