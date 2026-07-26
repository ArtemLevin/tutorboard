# Coordinate systems and ownership

TutorBoard keeps mathematical meaning, GeometryOS layout, board placement,
viewport navigation and physical rendering in separate coordinate spaces.

## Spaces

| Space                    | Unit / origin                          | Owner                                | Persisted |
| ------------------------ | -------------------------------------- | ------------------------------------ | --------- |
| canonical GIR            | semantic; no display coordinates       | GeometryOS                           | yes       |
| Layout Document local    | finite 2D canvas, top-left `(0, 0)`     | GeometryOS Layout `0.1.0`            | raw input |
| Board object local       | object/group-local world units         | `BoardObject`                        | yes       |
| import visual            | Layout-local → Board world transform   | `GeometryImportRecord`               | yes       |
| generic group visual     | group-local → Board world transform    | `BoardGroup`                         | yes       |
| Board world              | unbounded logical units                | TutorBoard core                      | derived   |
| viewport / screen        | CSS pixels inside the stage            | `ViewportState` and canvas adapter   | viewport  |
| device pixels            | CSS pixels multiplied by browser DPR   | browser / canvas adapter             | no        |

Canonical GIR does not acquire coordinates in TutorBoard. Layout coordinates
are accepted only from the runtime-validated Layout Document. The canvas does
not infer semantics from positions or SVG.

## Viewport transform

For a world point \(w=(w_x,w_y)\), viewport offset \(o=(o_x,o_y)\), positive
zoom \(z\), and stage-local screen point \(s\):

\[
s = z \cdot w + o
\]

\[
w = \frac{s-o}{z}
\]

`worldToScreen` and `screenToWorld` are the only application-facing conversion
helpers. Pointer deltas are sampled in world coordinates, so committed movement
does not depend on zoom. Device-pixel ratio affects rendering sharpness only.

## Object and group transforms

User objects store local geometry plus `position`, `rotation`, `scale`, and
style. A generic group contributes `BoardGroup.transform` before the viewport
transform.

GeometryOS objects use a different, single-owner chain:

```text
Layout/Object local
  -> GeometryImportRecord.visualTransform
  -> optional per-object visualOverride
  -> Board world
  -> ViewportState
  -> CSS/device pixels
```

The imported root `BoardGroup.transform` must remain identity. This prevents one
translation from being represented by both the group and import record.

Whole-construction drag composes a world-space delta into
`visualTransform.translation`. Label offset composes a delta into the label's
per-object override. Style overrides do not change coordinates. Canonical GIR,
Layout-local object positions and mapping stay unchanged.

## Initial geometry placement

The prompt orchestrator centers Layout bounds on the current visible world
center:

\[
t_x = c_x - \frac{\text{layout.width}}{2}, \quad
t_y = c_y - \frac{\text{layout.height}}{2}
\]

where \(c\) is obtained by converting the stage center through
`screenToWorld`. The translation is stored once in the import visual transform;
Layout coordinates are copied into local Board primitives without baking the
placement into every object.

## Persistence boundary

Persisted:

- object-local geometry;
- generic group transforms;
- import visual transform and per-object overrides;
- committed viewport.

Runtime-only:

- pointer capture;
- drag/marquee previews;
- transient pan/zoom preview;
- CSS layout and stage size;
- DPR and canvas nodes.

Autosave observes only committed `BoardDocument` revisions. A drag produces one
command and therefore one durable transform update, not a stream of pointer
positions.

## Invariants

- every numeric coordinate and transform component is finite;
- zoom and scale are positive;
- import root group transform is identity;
- visual movement never mutates canonical GIR;
- canvas code consumes an immutable scene read model;
- no renderer reconstructs semantic references from geometry;
- no pointer preview is serialized.
