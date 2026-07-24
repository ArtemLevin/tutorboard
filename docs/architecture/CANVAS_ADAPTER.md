# Infinite canvas and Konva adapter

PR 2.3 introduces Konva as a replaceable rendering adapter. It does not make
Konva, React component state, or canvas nodes part of `BoardDocument`.

## Ownership

| Owner                   | Responsibility                                                                 |
| ----------------------- | ------------------------------------------------------------------------------ |
| `core`                  | Pure coordinate transforms and immutable `BoardSceneReadModel`                 |
| `modules/drawing`       | Pure drawing interaction state and completed object intent                     |
| `modules/selection`     | Pure selection/drag state, world-space bounds and command intent                |
| `adapters/canvas-konva` | Konva rendering, runtime preview, pointer normalization and capture lifecycle  |
| `app`                   | Owns `BoardDocument`, creates command metadata and commits commands             |

The dependency direction is:

```text
app -> adapters/canvas-konva/public -> core/public
app -> modules/drawing/public -> core/public
app -> modules/selection/public -> core/public
app -> core/public
```

The canvas adapter cannot import `BoardDocument`, commands, or the reducer. It
receives only `BoardSceneReadModel` plus explicit runtime preview items. It
emits proposed viewport state and world-pointer samples through callbacks. The
application composition root turns those intents into `core.viewport.set` or
routes them through the drawing state machine.

Selection follows the same boundary: Konva reports a hit object ID and
world-pointer samples, while the application routes them through
`modules/selection`. The adapter receives only selected IDs, world-space
selection rectangles and a runtime preview delta. It never imports the
selection module or mutates the document.

## Coordinate contract

TutorBoard uses CSS pixel screen coordinates and unbounded world coordinates:

```text
screen = world * zoom + offset
world  = (screen - offset) / zoom
```

World coordinates may be negative. Device pixel ratio affects Konva's backing
buffer only; it is absent from coordinate conversion and committed document
state.

`worldToScreen`, `screenToWorld`, `panViewport`, and `zoomViewportAt` are pure
core functions. Pan adds a CSS-pixel delta to viewport offset and never changes
object coordinates. Pointer-centred zoom:

1. resolves the world point under the screen anchor;
2. clamps zoom to `0.1…8`;
3. computes the new offset so the same world point remains under the anchor.

These limits are adapter operational limits, not a new stored-schema rule.

## Renderer read model

`selectBoardScene` emits ordered render items and viewport state. Every item
contains:

- one immutable `BoardObject`;
- its ordered ancestor transform chain.

For user objects, the chain contains the generic group transform when present.
For GeometryOS objects, it contains the import visual transform followed by an
optional per-object visual override. Canonical GIR is never inspected or
reconstructed by the renderer.

The Konva registry maps stored object kinds to renderer contributions and
rejects duplicate or missing registrations explicitly. The default registry
covers every `BoardObject 0.1` kind.

## Interaction lifecycle

Pan follows:

```text
idle -> capturing -> previewing -> committed | cancelled -> idle
```

Supported starts:

- left pointer while the hand tool is active;
- `Space` + left pointer;
- middle pointer independently of the active tool.

The adapter stores the start viewport and pointer ID, captures the pointer, and
keeps preview viewport state locally. Pointer up commits exactly one viewport
intent. Escape, pointer cancel, lost capture, window blur, hand-tool switch, or
unmount discard the preview and release capture.

Wheel events are previewed immediately and coalesced into one viewport intent
after a short idle window. Escape, blur, unmount, or an external viewport update
cancels an uncommitted wheel preview.

Drawing uses the same capture guarantees. The adapter subtracts the stage
container bounds from browser client coordinates, then calls `screenToWorld`
with the viewport snapshot taken at pointer down. It emits start, move, finish
or cancel samples and never constructs objects or commands. Wheel zoom is
blocked during a captured drawing gesture.

Drawing preview items are rendered through the normal registry but are not part
of the immutable scene selector. Escape, pointer cancel, lost capture, blur,
tool-key change, or unmount releases capture and emits no completed intent.

Selection uses click, `Shift` click and marquee capture. Hit testing identifies
the renderer-owned object node, while deterministic area intersection and group
expansion live in the feature module. Drag and marquee previews are runtime-only.
Pointer up emits at most one completed movement intent; Escape, pointer loss,
blur, tool switch, viewport replacement and unmount discard the preview.

## Resize, grid and origin

`ResizeObserver` controls the Konva stage size from its container. Resizing does
not rewrite viewport or object coordinates. The adaptive grid is derived from
the visible world bounds, while red and blue debug axes identify the world
origin. Grid line width is normalized by zoom.

## Enforcement

| Invariants                               | Evidence                                                             |
| ---------------------------------------- | -------------------------------------------------------------------- |
| `CANVAS-001`, `CANVAS-002`, `CANVAS-005` | Pure coordinate unit tests                                           |
| `CANVAS-003`, `CANVAS-004`, `CANVAS-009` | Pointer unit test and browser pan/draw/select/cancel scenarios        |
| `CANVAS-006`, `CANVAS-007`               | Read-model API and architecture-rule tests                           |
| `CANVAS-008`                             | CSS-pixel math excludes DPR; browser rendering remains adapter-owned |
| `DOC-001`, `DOC-012`                     | Existing strict schema/serialization fixtures plus adapter boundary  |

Resize handles, undo/redo, persistence, and accessibility alternatives to the
bitmap canvas remain later stages.
