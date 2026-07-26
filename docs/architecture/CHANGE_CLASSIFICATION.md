# Geometry change classification

GeometryOS imports use a deny-by-default boundary between presentation changes
and mathematical edits.

| Change                         | Class          | Current behavior | Canonical GIR |
| ------------------------------ | -------------- | ---------------- | ------------- |
| construction translation       | visual         | allowed          | unchanged     |
| label offset                   | visual         | allowed          | unchanged     |
| stroke/fill/opacity/width style | visual         | allowed          | unchanged     |
| independent point drag         | mathematical   | blocked          | unchanged     |
| constrained point drag         | mathematical   | blocked          | unchanged     |
| semantic element deletion      | mathematical   | blocked          | unchanged     |
| unknown operation              | unknown        | blocked          | unchanged     |

## Ownership

- import placement: `GeometryImportRecord.visualTransform`;
- label offset and presentation: `GeometryImportRecord.visualOverrides`;
- local Layout coordinates: immutable Board object geometry;
- mathematical meaning: `GeometryImportRecord.canonicalGir`;
- root import group transform: always identity.

## Command behavior

`core.selection.move` translates an imported root group through its import
record. `core.geometry.translate` exposes the same rule explicitly.
`core.geometry.label-offset` accepts imported text objects only.
`core.geometry.style-override` accepts bounded Board style properties.

Every command validates the complete candidate document and returns the original
document reference on failure. Locks apply to the full import. Generic imported
object move and delete commands remain rejected.

## Experiment evidence

The platform-neutral policy module can emit redacted events through an injected
logger. An event records identifiers, timestamp, requested change,
classification and allow/block decision. It excludes prompt text, GIR, Layout,
HTTP payloads and credentials.

The independent-point-drag flag is off. A future flag change must not enable
point movement until GeometryOS publishes an accepted semantic edit and
recomputation contract.
