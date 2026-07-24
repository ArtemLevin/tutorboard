# Selection module

PR 2.5 adds object selection and movement without adding selection state to
`BoardDocument 0.1`.

## Ownership

| Owner | Responsibility |
| --- | --- |
| `modules/selection` | Tool ID, runtime state machine, bounds, group expansion and command factories |
| `adapters/canvas-konva` | Object hit ID, pointer normalization/capture and visual overlays |
| `app` | Runtime state, command metadata, composition and inspector |
| `core` | Atomic document commands and stored lock fields |

Dependencies remain directed inward:

```text
app -> modules/selection/public -> core/public
app -> adapters/canvas-konva/public -> core/public
app -> core/public
```

The selection module does not import React, Konva or browser APIs. The adapter
does not import the module, commands, reducer or `BoardDocument`.

## Runtime lifecycle

The `selection.select` tool supports:

- click selection;
- `Shift` additive selection and toggle;
- world-space marquee selection;
- drag preview;
- Escape/cancel recovery.

Selection state, marquee bounds and preview deltas are runtime-only. A completed
drag emits one movement intent; cancel emits no command. The module calculates
axis-aligned world bounds from the immutable scene read model, so viewport zoom,
offset and DPR cannot change selection results.

## Groups and atomic movement

Selecting any member of a generic group expands the visual selection to all
members. Command factories normalize the selection into independent object IDs
and group IDs. `core.selection.move` applies both target sets atomically:

- independent objects update `position`;
- generic groups update `BoardGroup.transform.translation`;
- group members are never moved twice;
- locked targets reject the entire command;
- imported GeometryOS movement remains rejected until its visual/semantic
  policy is decided.

`core.selection.set-lock` changes existing stored `locked` fields and therefore
does not change the document schema. Locking or unlocking a selected group
applies the same value to the group and its members so a later member-level lock
cannot leave the inspector unable to unlock the selection. Delete reuses
`core.objects.delete` after group expansion.

## Compatibility

Stored schema before and after PR 2.5 is `BoardDocument 0.1`. No migration is
required. Selection, preview, pointer capture and inspector state are excluded
from serialization.

## Enforcement

| Invariants | Evidence |
| --- | --- |
| `ARCH-001`, `ARCH-002`, `ARCH-004`, `ARCH-005` | public-module imports and architecture checks |
| `DOC-001`, `DOC-006`, `DOC-011`, `DOC-012` | unchanged schema and serialization fixtures |
| `CMD-001`, `CMD-002`, `CMD-004`–`CMD-006`, `CMD-008` | reducer/module tests and browser scenarios |
| `CANVAS-003`–`CANVAS-005`, `CANVAS-009`, `CANVAS-010` | world-space bounds, drag and cancellation tests |
