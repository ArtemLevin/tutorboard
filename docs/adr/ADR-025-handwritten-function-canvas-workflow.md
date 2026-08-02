# ADR-025 — Handwritten function canvas workflow

## Status

Accepted for handwritten-function PR 3.

## Context

PRs 1 and 2 provide a bounded multi-stroke session, a provider-neutral
recognition port and deterministic conversion into validated explicit functions.
TutorBoard still needs an application workflow that composes those contracts with
BoardStage, BoardDocument history and coordinate-plot creation.

The source ink must remain recoverable when recognition fails, the teacher edits
the candidate or the graph is undone. Persisting each stroke during pointer input
would create noisy history and expose partially captured expressions. Keeping all
ink transient until final graph creation would discard the teacher's work when a
provider operation fails or the workflow is closed.

## Decision

- Add a dedicated `math.handwritten-function` canvas tool and shortcut `F`.
- Keep strokes transient while the teacher is collecting input.
- Materialize all completed strokes together in one `core.objects.add` command
  immediately before recognition or when the workflow is closed with keep-ink
  semantics.
- Inject recognition through the existing optional `MathInkRecognizer` port.
- Keep provider absence as a supported manual-correction state.
- Interpret provider candidates through PR 2 and revalidate every edited draft
  through the same production pipeline.
- Render a non-interactive coordinate-plot preview from the validated draft.
- Build the final plot through one `core.objects.replace` command containing the
  exact persisted stroke snapshots and one coordinate-plot replacement.
- Position the plot around the source-ink bounds and fit its coordinate viewport.
- Abort the active recognizer on clear, Escape, tool switch, unmount or a newer
  recognition attempt.
- Reject final composition when source snapshots are stale or missing.
- Expose the workflow behind `VITE_FEATURE_HANDWRITTEN_FUNCTIONS`, enabled by
  default for development and test and disabled by default for production.
- Keep provider HTTP adapters, credentials, quotas and accuracy evidence outside
  this increment.

## Consequences

The teacher receives a complete local workflow before a production recognition
provider is selected. Automatic recognition can be injected in tests and future
runtime composition without changing canvas or graph logic.

History contains at most two semantic entries for a completed workflow: one ink
materialization and one atomic replacement. Undoing the replacement restores all
source strokes in one operation.

Source ink survives failures and intentional workflow closure. Explicit clear is
the only workflow action that removes persisted input.

BoardDocument 1.1, coordinate-plot persistence and expression semantics remain
unchanged.
