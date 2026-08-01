# Coordinate plot release checklist

The dedicated PR 6 job and every existing TutorBoard release gate succeeded on the same code head. The final documentation-only head reruns the complete matrix before merge.

## Functional scope

- [x] Create a coordinate plane from the toolbar and `G` shortcut.
- [x] Open the editor by double-click, Enter and the selection inspector.
- [x] Add explicit and parametric series.
- [x] Add shared parameters and use bounded sliders.
- [x] Configure viewport, grid, axes, labels and legend.
- [x] Pan and zoom the internal viewport.
- [x] Save one semantic edit command and verify undo/redo.
- [x] Duplicate a restored coordinate plane.

## Durability

- [x] IndexedDB round-trip preserves the complete definition.
- [x] Scheduled autosave is flushed on visibility loss and page exit.
- [x] Reload restores the most recent valid revision.
- [x] Corrupt newest revision falls back to the previous valid revision.
- [x] Recovery diagnostics retain the corrupt raw record.
- [x] Exported JSON reimports without information loss.

## Synchronization

- [x] Coordinate-plot create and update commands queue offline.
- [x] Reconnection submits commands with the expected document checksum.
- [x] Accepted revisions acknowledge the queue.
- [x] Remote batches replay deterministically.
- [x] Collaborative update inverse restores the previous definition.
- [x] Revision gaps and invalid snapshots enter recovery state.

## Performance

- [x] Representative multi-series sampling remains within point and evaluation limits.
- [x] A page with sixteen coordinate planes stays within the CI time budget.
- [x] Repeated sampling uses bounded cache entries.
- [x] Serialization and deserialization remain within the CI budget.
- [x] Scene selection avoids retained documents after reset.

## Browser matrix

- [x] Chromium production build.
- [x] Firefox production build.
- [x] Save, reload, reopen, duplicate and export scenario.
- [x] Formula diagnostics and valid sibling rendering.
- [x] Internal pan and pointer-anchored zoom.
- [x] Editor remains above development diagnostics.

## Packaging and security

- [x] Production bundle succeeds.
- [x] Immutable image builds with revision metadata.
- [x] Container runs as user `101`.
- [x] Read-only filesystem startup succeeds.
- [x] Capabilities are dropped and `no-new-privileges` is enabled.
- [x] Trivy reports no unfixed HIGH or CRITICAL release blockers.

## Documentation

- [x] ADR-016 accepted.
- [x] Production runbook published.
- [x] Supported scope and hard limits documented.
- [x] Recovery and diagnostics procedures documented.
- [x] PR has no unresolved review threads.
