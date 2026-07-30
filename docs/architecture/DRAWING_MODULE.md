# Drawing module

PR 2.4 introduces the first feature module with real behavior. It creates
existing `BoardDocument 0.1` object kinds; it does not change the stored schema.

## Ownership

| Owner                   | Responsibility                                                              |
| ----------------------- | --------------------------------------------------------------------------- |
| `modules/drawing`       | Tool IDs, definitions, defaults, pure state machine and command factory     |
| `adapters/canvas-konva` | Canvas-local pointer normalization, capture lifecycle and preview rendering |
| `app`                   | Active tool, runtime state, ID/time/actor creation and reducer commit       |
| `core`                  | Stored object contracts, validation, serialization and add reducer          |

Dependencies stay directed inward:

```text
app -> modules/drawing/public -> core/public
app -> adapters/canvas-konva/public -> core/public
app -> core/public
```

The drawing module never imports Konva or browser APIs. The canvas adapter never
imports the drawing module, commands, the reducer, or `BoardDocument`.

## Public tool contract

The module publishes six namespaced IDs:

- `drawing.pen`;
- `drawing.smart-ink`;
- `drawing.line`;
- `drawing.rectangle`;
- `drawing.ellipse`;
- `drawing.text`.

Each definition declares its label, shortcut and `board.write` capability
requirement. The composition root uses the definitions to build the primary
toolbar. Selection remains PR 2.5 scope.

The pure interaction lifecycle is:

```text
idle -> drawing-pen | drawing-shape | placing-text
     -> completed | cancelled
     -> idle
```

Every action contains an explicit pointer ID and world point. A mismatched
pointer cannot complete another pointer's interaction. Empty text and
zero-sized geometry produce diagnostic codes without user content.

`drawing.smart-ink` shares the pen sampling lifecycle. After the completed
stroke is committed, the app asks the Smart Ink module for a versioned
recognizer proposal.

## Preview and commit

The state machine returns a runtime preview object separately from a completed
object. `BoardStage.previewItems` renders it through the normal registry, but
the preview never enters `BoardSceneReadModel` or `BoardDocument`.

On pointer up, the state machine returns at most one completed object. The
composition root supplies object ID, command ID, actor and timestamp, then the
module command factory creates one `core.objects.add`. Escape, pointer cancel,
lost capture, blur, tool switch and unmount release capture without a command.

## Geometry normalization

- pen points are sampled and stored in world coordinates; the object position
  is the world origin so later movement can translate the stroke;
- line position is its start point and `end` is the world delta;
- rectangle position is the minimum corner and size is positive;
- ellipse position is the centre and radius is positive;
- text is trimmed and placed at the completed world point.

Duplicate adjacent pen points are omitted and strokes are capped at the
`BoardDocument 0.1` validator limit of 100,000 points. Pressure is accepted at
the canvas boundary for future input policy but is not persisted because schema
`0.1` has no pressure field. Adding it requires an explicit schema-version and
migration decision.

## Enforcement

| Invariants                                 | Evidence                                                   |
| ------------------------------------------ | ---------------------------------------------------------- |
| `ARCH-001`, `ARCH-002`, `ARCH-004`         | import-boundary checks for module/core/adapter public APIs |
| `DOC-001`, `DOC-006`, `DOC-011`, `DOC-012` | strict schema, serialization fixture and command reducer   |
| `CMD-002`, `CMD-004`, `CMD-008`            | composition/unit tests and browser gesture scenarios       |
| `CANVAS-003`, `CANVAS-004`, `CANVAS-009`   | pointer unit test and browser capture/cancel scenarios     |
| `CANVAS-010`                               | state-machine and tool-switch browser scenarios            |
