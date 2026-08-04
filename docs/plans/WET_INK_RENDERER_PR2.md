# Wet ink renderer — PR 2

## Goal

Make handwriting feel visually attached to the pointer while preserving `BoardDocument 1.1`, drawing reducers and synchronization contracts.

## Runtime design

- a dedicated non-listening Konva layer renders the active freehand stroke;
- the active line and the predicted tail are managed imperatively outside React state;
- hardware samples are accumulated between animation frames;
- `requestAnimationFrame` produces at most one wet-ink paint per display frame;
- actual samples are retained separately from browser predictions;
- predicted samples are replaced by the latest prediction batch and are never committed to document state;
- drawing callbacks are delivered to App in frame-sized batches;
- pointer-up synchronously flushes the pending domain batch before the final reducer action;
- the final wet-ink frame remains visible until the following animation frame, covering the document commit transition.

## Browser behavior

- Chromium and compatible browsers consume `PointerEvent.getPredictedEvents()` when available;
- Firefox and other environments use an empty prediction batch;
- prediction failures, malformed arrays and samples from another pointer are ignored;
- `getCoalescedEvents()` remains the source of committed high-resolution samples.

## Latency measurement

The renderer records input-to-canvas-render latency for each committed hardware sample:

- latest latency;
- running mean;
- maximum;
- rolling p95 over 240 samples;
- total rendered sample count and frame count.

BoardStage exposes these diagnostics through `data-wet-ink-*` attributes without React state updates.

## Bounds

- 100,000 actual points per active wet stroke;
- 64 predicted points per prediction batch;
- one pending animation frame per renderer;
- one pending domain callback frame per drawing session;
- latency window limited to 240 samples.

## Verification

- unit tests for frame coalescing, prediction replacement, final-frame clearing, cancellation and latency statistics;
- unit tests for predicted-event API fallback, filtering and bounds;
- performance gate for 20,000 samples in frame-sized batches;
- Playwright checks for transient rendering, prediction API use, latency diagnostics and fallback behavior;
- existing Chromium and Firefox browser smoke, architecture, contracts, production image and security gates.

## Rollback

The implementation is isolated to the canvas adapter and App callback batching. A normal PR revert restores the previous React preview path without document migration.
