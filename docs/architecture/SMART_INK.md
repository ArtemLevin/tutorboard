# Smart Ink main-canvas integration

Recognizer `0.5-spike` connects to TutorBoard's main canvas with immediate
correction for confident figures and an explicit choice for uncertain ones.

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
5. Ambiguous input keeps the original stroke and offers two one-click choices,
   plus an explicit “Оставить штрих” action.
6. Unrecognized input stays as ink without interruption.
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
`minimumConfidence=0.34`, `ambiguityMargin=0.04` and `sampleCount=96`.
Near-round ellipses with a minor-to-major axis ratio of at least `0.75` use the
circle fit when its confidence is at least `0.25`. This widens tolerance for
hand-drawn circles while keeping visibly elongated ellipses distinct.

Circle/ellipse and rectangle/square are decision families: sibling variants
may rank each other, but they do not suppress a confident replacement. Smooth,
closed oval traces with a competing polygon fit are treated as ambiguous
instead of being silently converted to a polygon.

Arrows support the common shaft-tip-wing-tip-wing gesture and a continuous
shaft-tip-wing-wing gesture. Three recent line strokes can form an arrow or a
triangle; four can form a quadrilateral. Multi-stroke recognition only inspects
objects completed in the previous six seconds and replaces the whole gesture
with one atomic history command.

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

## Production release gate

`VITE_FEATURE_SMART_INK` controls registration of the Smart Ink tool. Development
and test stages enable it by default. Production disables it until reviewed
Chromium and Firefox evidence closes the Phase 9 quality gate. Diagnostics are
available only when both Smart Ink and its diagnostics flag are enabled.

The gate changes product availability while preserving existing board objects,
command readers and stored document compatibility. Promotion and rollback are
documented in
[`SMART_INK_RELEASE_GATE.md`](SMART_INK_RELEASE_GATE.md).

## Quality boundary

The checked-in Chromium corpus remains development evidence. Its v5 report has
macro precision `0.992754`, macro recall `0.952591`, ambiguity `0.016598` and
zero false positives. The independent v2 regression has macro precision
`0.988328`, recall `0.933333` and false-positive rate `0.008333`. Firefox and
broader device evidence are still required to close the production gate.
