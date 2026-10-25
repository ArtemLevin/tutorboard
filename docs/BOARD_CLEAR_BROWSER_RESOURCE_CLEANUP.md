# Reclaiming browser-owned board resources after Clear

A board-specific full reset releases transient image resources without clearing
HTTP caches, Service Worker state, localStorage, IndexedDB, media uploads, or the
durable collaboration queue. Browser applications cannot clear the user's entire
browser cache.

## Resource ownership

- **Konva / GPU surfaces:** The scene generation is replaced after a
  populated-to-empty transition, including synchronized remote clears.
- **Embedded PNG/JPEG bitmap decodes:** The outgoing document's data URL
  identities are retired through `RasterDecodeCache.discardSourceWhenUnused`.
  Unreferenced bitmaps close immediately; active leases remain valid and close
  when the last consumer releases them. Other unrelated cached sources remain.
  The former `BoardStage` global `trimUnused()` on scene teardown is removed:
  resetting one board no longer flushes reusable idle bitmaps cached by another
  board. The existing per-scene source retirement remains in place.
- **Asset-backed media / GIF Blob URLs:** The outgoing canvas registry is
  disposed on full reset. It retires asset source keys; individual consumers
  release decode and Blob URL leases through the existing unmount and resource
  scope lifecycles. Active consumers belonging to another board are preserved.
- **Stroke/scene cache and plot sampling:** The existing scene-generation and
  coordinate plot sampling reset paths remain in effect.
- **Undo and document persistence:** Full reset discards local Undo/clipboard
  snapshots as before. The document clear is persisted by the ordinary command
  pipeline; database content and collaboration protocol are unchanged.

## Scenarios

The irreversible full reset proactively retires sources even before the previous
canvas unmounts. A synchronized document transition from populated to empty
also retires embedded sources. Reversible clear preserves undoable document
data; if an image is reintroduced with Undo after resource retirement, the
bitmap is decoded again.

The existing browser performance profile
(`tests/e2e/cleared-board-zoom-profile.spec.ts`) compares a loaded scene of
3,000 strokes and 10 PNG images with the cleared scene. A focused cache
regression asserts that a shared active bitmap is never closed early and
unrelated retained images are untouched.
