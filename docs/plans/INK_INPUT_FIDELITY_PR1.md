# Ink input fidelity — PR 1

## Goal

Improve the visual continuity of freehand writing and curves while preserving the existing `BoardDocument 1.1` schema and command protocol.

## Scope

- consume bounded `PointerEvent.getCoalescedEvents()` batches;
- retain the dispatched endpoint when a browser omits it from the batch;
- process all samples synchronously inside one native pointer event;
- keep a safe single-event fallback for Chromium, Firefox and environments without the API;
- reduce storage simplification from `0.75` to `0.1` world units;
- resolve render simplification, resampling distance and segment length in screen-space pixels through the active zoom;
- smooth cached closed pen contours through the closed Catmull–Rom pipeline;
- preserve the existing pen-stroke object shape, persistence, clipboard, history and collaboration contracts.

## Bounds

- a coalesced event contributes at most 256 samples including the dispatched endpoint;
- adjacent exact duplicates are removed;
- samples from another pointer ID are ignored;
- stored pen strokes retain the existing 100,000-point ceiling;
- render output retains the existing 20,000-point ceiling and per-zoom cache.

## Verification

Unit coverage includes:

- API unavailable, empty and throwing fallbacks;
- ordered batches, endpoint insertion, duplicate removal and bounded input;
- zoom-aware smoothing quality;
- fast circle;
- letters `S`, `M`, `Ж`;
- handwritten `8`;
- open and closed per-zoom caches.

Playwright coverage runs in Chromium and Firefox and verifies:

- drawing with `getCoalescedEvents` explicitly unavailable;
- invocation of the coalesced-event path during normal freehand input;
- high-zoom selection and transformation of a smoothed stroke.

## Rollback

The change is isolated to the canvas input adapter, transient drawing completion and render-time smoothing. A normal PR revert restores the previous behavior without document migration.
