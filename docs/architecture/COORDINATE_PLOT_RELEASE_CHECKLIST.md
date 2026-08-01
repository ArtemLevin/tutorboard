# Coordinate plot release checklist

## Functional scope

- [ ] Create a coordinate plane from the toolbar and `G` shortcut.
- [ ] Open the editor by double-click, Enter and the selection inspector.
- [ ] Add explicit and parametric series.
- [ ] Add shared parameters and use bounded sliders.
- [ ] Configure viewport, grid, axes, labels and legend.
- [ ] Pan and zoom the internal viewport.
- [ ] Save one semantic edit command and verify undo/redo.
- [ ] Duplicate a restored coordinate plane.

## Durability

- [ ] IndexedDB round-trip preserves the complete definition.
- [ ] Scheduled autosave is flushed on visibility loss and page exit.
- [ ] Reload restores the most recent valid revision.
- [ ] Corrupt newest revision falls back to the previous valid revision.
- [ ] Recovery diagnostics retain the corrupt raw record.
- [ ] Exported JSON reimports without information loss.

## Synchronization

- [ ] Coordinate-plot create and update commands queue offline.
- [ ] Reconnection submits commands with the expected document checksum.
- [ ] Accepted revisions acknowledge the queue.
- [ ] Remote batches replay deterministically.
- [ ] Collaborative update inverse restores the previous definition.
- [ ] Revision gaps and invalid snapshots enter recovery state.

## Performance

- [ ] Representative multi-series sampling remains within point and evaluation limits.
- [ ] A page with sixteen coordinate planes stays within the CI time budget.
- [ ] Repeated sampling uses bounded cache entries.
- [ ] Serialization and deserialization remain within the CI budget.
- [ ] Scene selection avoids retained documents after reset.

## Browser matrix

- [ ] Chromium production build.
- [ ] Firefox production build.
- [ ] Save, reload, reopen, duplicate and export scenario.
- [ ] Formula diagnostics and valid sibling rendering.
- [ ] Internal pan and pointer-anchored zoom.
- [ ] Editor remains above development diagnostics.

## Packaging and security

- [ ] Production bundle succeeds.
- [ ] Immutable image builds with revision metadata.
- [ ] Container runs as user `101`.
- [ ] Read-only filesystem startup succeeds.
- [ ] Capabilities are dropped and `no-new-privileges` is enabled.
- [ ] Trivy reports no unfixed HIGH or CRITICAL release blockers.

## Documentation

- [ ] ADR-016 accepted.
- [ ] Production runbook published.
- [ ] Supported scope and hard limits documented.
- [ ] Recovery and diagnostics procedures documented.
- [ ] PR has no unresolved review threads.
