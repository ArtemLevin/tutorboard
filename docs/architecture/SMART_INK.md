# Smart Ink main-canvas integration

This Phase 9 increment connects recognizer `0.4-spike` to TutorBoard's main
canvas with immediate correction for confidently recognized figures.

## Ownership

| Boundary                  | Responsibility                                                                   |
| ------------------------- | -------------------------------------------------------------------------------- |
| `modules/smart-ink-spike` | Deterministic single-stroke recognition and confidence                           |
| `modules/smart-ink`       | Mapping fitted geometry to BoardDocument objects and diagnostic publication       |
| `app`                     | Tool selection, recognition policy, automatic replacement and development evidence UI |
| `core`                    | Atomic deterministic object replacement                                          |
| `canvas-konva`            | Pointer sampling and rendering committed board objects                           |

## State flow

1. `drawing.smart-ink` samples one stroke through the standard pen state
   machine.
2. Pointer completion commits the source `drawing.pen-stroke`.
3. The recognizer publishes a bounded technical diagnostic record containing
   world points, candidates, confidence, metrics and the active policy version.
4. A recognized proposal immediately emits one `core.objects.replace` command
   carrying complete original and replacement snapshots.
5. Ambiguous and unrecognized input keeps the original stroke.
6. No proposal panel or acceptance prompt is rendered.
7. Local history undo restores the source snapshot. Collaborative undo emits
   the same command with the snapshot arrays reversed.

Line, circle, ellipse, rectangle and square fits map to their native
BoardDocument 1.0 primitives. A triangle maps to a simplified closed pen
stroke until a persistent polygon kind is introduced through a later document
contract revision.

The source and replacement reuse the same object ID, so layer position and
selection references stay stable. The reducer rejects missing, locked, grouped,
imported and stale source snapshots.

The canvas uses the Chromium-calibrated thresholds
`minimumConfidence=0.34`, `ambiguityMargin=0.02` and `sampleCount=96`.
Near-round ellipses with a minor-to-major axis ratio of at least `0.75` use the
circle fit when its confidence is at least `0.25`. This widens tolerance for
hand-drawn circles while keeping visibly elongated ellipses distinct.

## Development diagnostics

`VITE_FEATURE_SMART_INK_DIAGNOSTICS=true` mounts an isolated diagnostics overlay.
The panel displays recognizer status, selected and runner-up candidates,
confidence margin, shape metrics, source/sample point counts, pointer metadata,
policy thresholds and recognizer version.

The export action produces a one-sample `tutorboard.smart-ink-corpus/0.1` JSON
file. It contains only gesture coordinates and technical metadata. The generated
sample is marked through `captureDiagnostics.labelStatus=unreviewed`; its
provisional class must be checked before it is merged into a calibrated corpus.
The production stage disables the panel by default.

## Quality boundary

The checked-in Chromium corpus remains development evidence. Firefox capture
is still required to close the cross-browser production gate. Auto-correction
only runs for the recognizer's `recognized` status; other input stays as ink.
