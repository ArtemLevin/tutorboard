# Smart Ink main-canvas integration

This Phase 9 increment connects recognizer `0.4-spike` to TutorBoard's main
canvas while preserving explicit teacher control.

## Ownership

| Boundary                  | Responsibility                                                                   |
| ------------------------- | -------------------------------------------------------------------------------- |
| `modules/smart-ink-spike` | Deterministic single-stroke recognition and confidence                           |
| `modules/smart-ink`       | Mapping fitted geometry to BoardDocument objects and acceptance command creation |
| `app`                     | Tool selection, proposal state, preview panel and user decisions                 |
| `core`                    | Atomic deterministic object replacement                                          |
| `canvas-konva`            | Rendering the source stroke and proposal preview                                 |

## State flow

1. `drawing.smart-ink` samples one stroke through the standard pen state
   machine.
2. Pointer completion commits the source `drawing.pen-stroke`.
3. A recognized proposal is rendered in green above the stored stroke.
4. Reject and Escape close the proposal while preserving the stroke.
5. Accept emits one `core.objects.replace` command carrying complete original
   and replacement snapshots.
6. Local history undo restores the source snapshot. Collaborative undo emits
   the same command with the snapshot arrays reversed.

Line, circle, ellipse, rectangle and square fits map to their native
BoardDocument 1.0 primitives. A triangle maps to a simplified closed pen
stroke until a persistent polygon kind is introduced through a later document
contract revision.

The source and replacement reuse the same object ID, so layer position and
selection references stay stable. The reducer rejects missing, locked, grouped,
imported and stale source snapshots.

## Quality boundary

The checked-in Chromium corpus remains development evidence. Firefox capture
is still required to close the cross-browser production gate. The proposal UX
therefore always requires explicit acceptance and exposes rejection.
