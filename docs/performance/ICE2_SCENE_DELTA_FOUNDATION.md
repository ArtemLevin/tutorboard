# ICE-02A — renderer-neutral scene-delta foundation

**Status:** experimental implementation, pending exact-head checks and review  
**Date:** 2026-11-17  
**Roadmap:** [ICE 2.0](../plans/INFINITE_CANVAS_ENGINE_2.md) and [ADR-033](../adr/ADR-033-infinite-canvas-engine-2.md)

## Purpose

Create a pure, minimal description of scene changes that downstream adapters
can later use for dirty-region invalidation. It compares a validated immutable
`BoardDocument` and its `BoardSceneReadModel` before and after an operation.
It never mutates either snapshot or creates graphics, canvases, Workers, timers
or external storage. It has **no production rendering integration yet**.

API exported through `src/core/public.ts`:

```ts
deriveBoardSceneDelta({
  previousDocument,
  previousScene,
  nextDocument,
  nextScene,
});
```

Results are `noop`, `camera`, `patch` or `reset`. A `patch` includes
added/removed immutable `BoardRenderItem` references and updated pairs,
plus unique `BoardObjectId` values. A `reset` requires full reconstruction
from the authoritative validated source in the future adapter.

## Conservative decisions

- Document replacement (different ID) -> reset.
- Any mismatch between a scene's object IDs and its document order -> reset.
- Arbitrary reorder, insertion in the middle or middle deletion -> reset.
  Tail append/tail delete with stable surviving order may be a patch.
- A change to an object's content, group or GeometryOS render dependencies
  produces a changed immutable item if `createBoardSceneSelector` is reused.
- Viewport-only, title-only and other operations whose immutable scene
  dependencies are identical produce no object changes.
- `previousScene`/old references are only retained in one transient delta;
  consumers must release them after application.

The current algorithm validates ordered membership and performs O(N) checks
and mapping for modified scenes. It avoids regenerating complex per-object
geometry but **does not yet provide O(changed objects)** updates. ICE-02B
will evaluate a command-informed change set, exact old/new world bounds,
spatial broad phase (R-tree/hash) and bounded dirty-run invalidation.

**Critical safety consideration:** an opaque `patch` is only a
*description of changed identities*. It is not permission to crop vector
strokes using approximate bounding boxes. Until precise bounds and ordered
paint-run dependencies are proved, the future tile adapter must conservatively
invalidate entire unsafe runs or use the known-correct Konva vector path.

## Tests

- Unit: initial creation, camera-only, metadata-only, one changed object,
  tail insertion/removal, reorder/middle deletion, document switch, corrupted
  scene ordering.
- Performance: 5,000 independently placed rectangles; change one immutable
  object and verify that delta references only that object, with a generous
  CI CPU budget. CPU success is not a frame-latency gain.
- Future: group/import transforms, remote revisions, clear/undo, actual
  spatial index, 100k memory, Chromium/Firefox visual and hit equivalence.

Production `BoardStage` and input/controller paths are untouched by
ICE-02A. No update to `BoardDocument` version, command codec or sync.
The module remains inert until a separate reviewed ICE-02B/ICE-03
integration gate.
