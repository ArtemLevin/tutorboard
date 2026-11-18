# ADR-033 — Infinite Canvas Engine 2.0: bounded, replaceable rendering

- **Status:** proposed (ICE-00, architecture only)
- **Date:** 2026-11-17
- **Scope:** TutorBoard; GeometryOS presentation, ink, media and plot rendering
- **Prerequisites:** [ADR-001](0001-canvas-renderer.md), [CANVAS_ADAPTER](../architecture/CANVAS_ADAPTER.md), [BOARD_MODEL](../architecture/BOARD_MODEL.md)
- **Execution plan:** [ICE 2.0](../plans/INFINITE_CANVAS_ENGINE_2.md)
- **Outstanding performance issue:** [#201](https://github.com/ArtemLevin/tutorboard/issues/201)

## Context

TutorBoard's large-board frame time includes scene selection, React/Konva
reconciliation, canvas scene/hit painting, compositor, media decoding,
viewport persistence and input scheduling. Existing C3.9 experiments measure
these individually; a stable 60 FPS result for the dense 5k/10k workloads is
not established. Synchronous cold `Group.cache()`, native crop on crossing
strokes, DPR2 raster parity and stable-culling-only experiments yielded
specific NO-GO findings. Experimental branches are not production fixes.

## Decision and rollout boundary

Keep Konva as the **default, reference and immediate fallback**. Develop an
optional hybrid renderer that uses scene deltas, spatial indexing, bounded
tiles and dirty-area repaint; GPU batching, optional OffscreenCanvas/Workers
and LOD require separate causal evidence before enabling.

This ADR authorizes an architecture contract and associated measurements.
It does not enable a backend or change board data, server APIs, stored commands,
authorization, recovery, the public import cap or export semantics.

### Ownership

```text
core/board: BoardDocument, commands, validation, canonical state
       |
       v
core scene selector + immutable SceneDelta / world bounds
       |
       v
app composition: gesture/pointer intent, feature flags, renderer lifecycle
       |                          |                        |
       v                          v                        v
Konva reference             optional hybrid backend     Wet Ink overlay
                                  |
                                  v
                     bounded tiles / GPU / scene Worker
```

- **Core:** deterministic object identity, immutable scene read models, pure
  geometry/world transforms, ordered render items, spatial broad phase.
  Must not import React, Konva, PixiJS, Three.js, WebGL, DOM or Worker.
- **App:** feature flag, capability selection, pointer ownership and commands.
  Runtime viewport preview remains separate from committed document changes.
- **Renderer adapters:** volatile graphics, hit surfaces, textures, cache
  admission/eviction, context loss and `dispose`. They never own or mutate
  the canonical `BoardDocument`.
- **Document/sync/persistence:** unchanged source of truth, revision ordering,
  authoritative remote replacement, ACL, command validation and recovery.

No Konva node, GPU buffer, bitmap, cache key, Tile or Worker response may enter
serialized BoardDocument/BoardCommand/transport content.

### Proposed adapter protocol (illustrative; exact types in ICE-03)

- `mount(host, capabilities)` creates one bounded lifecycle.
- `applyScene(snapshot, delta, epoch)` consumes immutable geometry.
- `setViewport(viewport, size, dpr)` updates rendering preview only.
- `invalidate(oldBounds, newBounds, epoch)` targets changed world regions.
- `hitTest(screenPoint, epoch)` returns exact source IDs or synchronously
  reverts to reference picking before interaction.
- `contextLost()` and `dispose()` discard work and resources.

An epoch includes **document identity + scene revision + renderer lifetime**.
A separate camera revision avoids rebuilding geometry on pure pan/zoom.
Late Worker/bitmap results for obsolete epochs are ignored. Full rebuild from
a validated scene replaces speculative repair after an authoritative reset.

## Geometry and interaction invariants

1. `BoardDocument.order` is the single persisted z-order. Interleaved ink,
   static media, animated GIF, text, SVG, coordinate plot and GeometryOS
   elements preserve compositing and clip order.
2. World/screen transform: `screen = world * zoom + offset`. DPR changes
   physical canvas resolution; persisted coordinates and pointer world
   geometry remain unchanged.
3. Cache tiles are addressed by document/scene generation, **ordered paint
   run**, world tile coordinates, resolution bucket, DPR and content revision.
   A run is not flattened across z-order barriers without fidelity proof.
4. Crossing strokes require complete geometry, padding and exact tile
   composition. No double alpha blending, missing edge, blurry zoom or seams.
   Prior Konva `Group.cache()` crop tests reject naïve per-tile cropping.
5. The original `BoardObjectId` remains addressable for precise selection,
   transform and partial eraser. Spatial index is a broad phase; the exact
   geometry/hit backend determines the final target.
6. Wet Ink is independent and gets the first scheduling priority: pressure,
   coalesced/predicted points, pointer capture/cancel and latency remain intact.
   No heavy synchronous cache allocation in pointer/wheel handlers.
7. Raster and LOD are derived previews; original vectors are required for
   editing, canonical GeometryOS provenance and PDF/PNG export.
8. Unknown styles, transforms, scene combinations or unsupported hardware
   fall back to the reference path. Public input validation remains strict,
   with owned immutable fast paths limited to certified state.

## Invalidation and memory contract

- Changes to add/delete/move/style/visibility/reorder/group/import,
  remote updates and undo/redo invalidate all affected **old and new**
  world bounds and ordering barriers.
- Clear, board switch, revoke, resize, zoom-bucket/DPR changes, late Worker
  response and WebGL context loss release or reject invalid resources.
- Before admission, account **scene + hit + scratch + intermediate CPU bitmap
  + GPU texture** allocations. RGBA surfaces cost at least
  `width * height * 4` bytes each, excluding copies/driver overhead.
- The current Konva wheel cache's 4,000,000 physical scene-pixel limit remains
  in force until a separate shared-budget experiment approves an alternative.
  Two cache engines may not double-count the same allowable allocation.
- Use bounded per-frame work, LRU eviction, task cancellation and vector
  fallback. Never create unlimited full-screen Konva Layers or monolithic
  wheel-time rasterization.
- Priorities: active ink/input > immediate interaction/hit > visible tiles >
  nearby speculative tiles. Correctness is required even with zero cache hits.
- Resource lifecycle is verified over at least 48 zoom/clear/reopen/switch
  cycles and through undo, reconnect, unmount and context recovery.

## Performance and correctness acceptance

| Dimension | Acceptance evidence |
| --- | --- |
| Fixture integrity | Same SHA, browser/device/GPU backend, document/media hash, ordering, actual visible count and applied viewport trajectory |
| Frame delivery | Trace-off rAF p50/p95/p99/max; rates >25/>50/>100ms; active, commit and settling plus full end-to-end window |
| Input | Wet Ink input-to-paint p95, first pointer during/after wheel, no lost pressure/capture samples |
| Fidelity | DPR1/DPR2 alpha/pixel parity or preapproved narrow tolerance, tile seams, exact hit IDs and partial eraser |
| Semantics | Groups, GeometryOS visual overrides, piecewise coordinate plots, Smart Ink, GIF ordering, PDF/PNG export |
| Persistence | Undo/redo, full clear, Dexie recovery, 2-client collaboration, permissions/revoke, offline/reconnect |
| Resources | Before-allocation budget, bounded retained CPU/GPU memory, context loss and 48+ lifecycle cycles |

**First opt-in GO criterion (ICE-06):** independently reproduced, paired,
trace-off end-to-end active p95 improvement >=20% on **both 5k and 10k** heavy
fixtures, on each of two independent runners; reduced rate of >100ms frames;
zero correctness regressions and no material memory, input, first-click or
persist-phase regression. Counterbalance A/B/B/A, compare runs as independent
units, retain source SHA/fixture hash/raw data, and report uncertainty.
Inconclusive/noisy samples do not establish GO.

Stretch targets (not currently achieved): pan p95 <=16.7ms; zoom p95 <=33.3ms
(prefer <=16.7ms); Wet Ink input-to-paint p95 <=20ms; no recurring >100ms
stall on representative input. 30k/100k are **research** workloads until
load, serialization, memory, persistence and sync contracts pass independently.

## Test ownership

| Contract | Responsible test suites |
| --- | --- |
| Scene identity and spatial index | Core selector equivalence, 5k performance, add/delete/reorder/group/import |
| Raster fidelity | Chromium+Firefox DPR1/2 pixel/alpha/hit, edge-crossing eraser |
| Input | Pen/Wet Ink/Smart Ink and drawing/selection browser suites |
| Domain visual | GeometryOS, coordinate plot including piecewise, text/SVG/media/3D |
| Persistence/sync | Undo/redo, clear, Dexie recovery, guest/read-only, reconnect/revoke |
| Resource lifecycle | Existing media-cache 48-cycle soak; GPU/Worker resource counters |
| End-to-end responsiveness | Existing C3.9 browser harness, deterministic ICE-01 manifest and independent ABBA |

Every candidate follows `inspect → reproduce → focused regression →
implementation → targeted + full CI → independent A/B → self-review →
GO/NO-GO → post-merge evidence`. Pure document PRs require Markdown/link
validation and have no asserted production performance benefit.

## Rejected and deferred options

- Entire board migrated to Three.js: no proven 2D improvement; keep existing
  Three.js 3D renderer and evaluate PixiJS/WebGL2/custom batching separately.
- Unlimited tiles or full-sized scene/hit layers: unbounded DPR-driven memory.
- Approximate bitmap-only picking: violates exact source IDs/eraser behavior.
- Disabling security validation at external/remote boundaries: violates
  ownership and recovery invariants.
- New chunked persisted document without versioned frontend/backend rollout:
  reserved for ICE-11, after profiling the existing storage/sync bottleneck.

## Rollback and revisit

`konva` remains the default; `hybrid` and future `gpu` are opt-in flags
outside BoardDocument. A failed renderer can release its transient cache and
reconstruct from the unchanged scene. No data migration is required for
ICE-00…ICE-10. Merge a production candidate only with an explicit GO;
otherwise document NO-GO, retain Konva and continue targeted investigation.
Issue [#201](https://github.com/ArtemLevin/tutorboard/issues/201) stays open
until its complete C3.9-E/F release gate is satisfied.
