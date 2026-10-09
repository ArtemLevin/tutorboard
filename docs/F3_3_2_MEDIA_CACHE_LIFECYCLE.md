# F3.3.2-A — Board media resource lifecycle contract

Baseline: main c49578e46800d4f830d012c7b4a3710dec67b393 (2026-10-08).

## Ownership and identities

A `BoardMediaResourceScope` represents one mounted board/resource authority.
Its immutable `boardId` and monotonically increasing `resourceGeneration`
form the identity that subsequent F3.3.2-C source resolvers will include in
cache keys. The generation is a local lifecycle counter; it does **not**
replace server authorization or `accessEpoch` verification.

The scope acquires asynchronous handles through a factory receiving an
`AbortSignal`. The returned lease is independent from all other leases,
including those on other boards. Successful settlement retains the lease
until explicit `release()`, `invalidate()` or `dispose()`. A failed
acquisition automatically releases its underlying handle.

- `release()` is idempotent and aborts a pending operation.
- `invalidate()` increments the generation and releases every lease
  acquired in the old generation. New acquisitions are permitted.
- `dispose()` releases every lease and permanently forbids acquisition.
- Results arriving after cancellation never resolve the scoped lease.
  The underlying cache is responsible for closing late native resources.
- Disposing one scope never calls a global cache `clear()`.

## Diagnostics

`BoardMediaResourceScope.snapshot()` exposes board identity, disposal state,
active, pending and ready lease counts. `RasterDecodeCache.snapshot()`
additionally exposes active reference count, zero-reference retained entries
and bytes, and pending entries. `MediaObjectUrlCache.snapshot()` reports
active references, pending entries and live object URLs.

The cache byte estimates describe decoded RGBA bytes; they are not a direct
measurement of browser heap. Zero references do not imply native resources
have been evicted until the appropriate cache eviction/trim policy runs.

## Rollout boundaries

A is an isolated, unit-tested ownership primitive and diagnostic contract.
It deliberately leaves existing renderer wiring unchanged. B will enforce
bounded source caches and addressable cancellation/eviction. C will bind
scope identity and generation to BoardCanvas/SyncedApp, including changes to
`accessEpoch`, board switches and revoke. D adds browser memory stress gates.
Legacy embedded images, persisted BoardDocument, backend API, commands and
undo/redo formats remain unchanged.

## B implementation (08.10.2026)

A per-registry `MediaSourceCache` retains at most 256 source descriptors and
prunes descriptors absent from the committed scene and previews. The registry
is disposed when its resolver changes or the canvas unmounts. The descriptor
cache never owns decoded resources or Blob URLs.

`RasterDecodeCache.discardSourceWhenUnused(sourceIdentity)` schedules targeted
cleanup after the last consumer releases its handle. Other active sessions
remain valid. The Set-backed queue deletes cancelled entries immediately.
Concurrent reservations bound *estimated in-flight decode memory* (128 MiB
by default) while admitting one oversized task to ensure progress.
Already-active decoded bitmaps may exceed the retained-cache budget.
A hard upper bound on the memory occupied by all visible media would require
adaptive image virtualization in a later rendering optimization.

GIF cancellations reject with AbortError even when source loaders ignore
AbortSignal. Late Blobs cannot create an object URL after cancellation.
Board and access-generation integration remains block C.

B cleanup wiring: stale asset descriptors deliver source cache keys to
`RasterDecodeCache.discardSourceWhenUnused()` during registry reconciliation
and disposal. Embedded PNG/JPEG identities are tracked in BoardStage and
retired after scene removal or unmount. This preserves reference-counted
resources still used by another mounted canvas.

## C integration (08.10.2026)

`SyncedWorkspace` now owns a `BoardMediaResourceScope` created in its effect
setup. StrictMode's discarded setup releases its scope before a replacement is
published. Refresh preparation invalidates leases synchronously and disables
media render/load; a successful access refresh invalidates once more, enables
media, and forces a new render generation. Terminal refresh failures,
`access.revoked` and terminal collaboration status dispose the scope.
Board switches unmount the previous workspace and dispose its independent
scope without clearing global caches used by another board.

Both raster bitmap and GIF object URL handles are acquired through the active
scope. Re-rendered images are generation-keyed; stale asynchronous completions
cannot repopulate the board after a refresh or revocation. Source resolution
additionally checks the current access context, generation and in-flight
refresh status. Read/write permission updates preserve authorized read access.

## D — cyclic browser memory/performance gate (09.10.2026)

The default Playwright `@smoke` suite runs **3 ×** populated → empty
BoardDocument import cycles in Chromium and Firefox, using one 1024×1024
representative RGBA PNG, four additional PNGs, three GIFs, a real pen
stroke and a coordinate plot per populated pass. Every cycle must recover
zero active decoded raster bytes/count, zero live GIF HTML elements and zero
remaining Blob URLs after the empty document mounts. We record the raster
start/release count, media URL counters and rAF p95 (180 ms broad CI ceiling)
per cycle. This workload exercises actual Konva mounting/unmounting and the
local document importer; browser instrumentation is injected with Playwright
and is absent from production assets.

The manual `Media cache cyclic soak` workflow runs **12 ×** on Chromium with
12 static images, eight GIFs and mixed ink/plot content. Chromium takes a
`HeapProfiler.collectGarbage` + `Performance.getMetrics` heap snapshot
after each cycle; Firefox runs strict native lifecycle checks without CDP.
Heap comparisons are published in JSON and are *diagnostic only* while
browser/runtime versions and persisted document history prevent a reliably
calibrated absolute JS-heap threshold. Estimated decoded native bytes are
verified separately; heap values must not be interpreted as native bitmap
memory measurements.

The isolated real-backend media-fullstack suite also covers asset-backed PNG
and GIF, guest offline/reconnect, write-rights epoch updates, guest revoke and
A→B→A board navigation with live Blob URL and decoded-raster checks. It
reuses the pinned backend and requires no change to production auth/data
contracts. JSON evidence is attached to Playwright reports, and CI uploads
failure traces. This gate does not claim all possible document sizes or
arbitrary browser-memory stability.

Regression finding during D: Chromium and Firefox both retained one guest
GIF Blob URL after a browser offline event. The WebSocket status notification
can lag the browser's network event, so `SyncedWorkspace` now synchronously
invalidates guest media leases in its `offline` listener before delegating to
the sync engine. A focused integration regression tests the exact offline
event and lease cancellation. Real-backend replay verifies native resources
return to baseline before reconnect.
