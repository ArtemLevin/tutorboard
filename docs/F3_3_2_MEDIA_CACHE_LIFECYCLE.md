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
