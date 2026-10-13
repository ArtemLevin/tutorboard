# Local clear: bounded document serialization

## Problem and root cause

Local autosave eagerly prepared every edited snapshot before its debounce.
The Worker client's WeakMap kept full JSON results as long as Undo retained
their document keys. Clearing removed canvas objects while retaining those
strings and outstanding preparation requests. Worker disposal also rejected
pending preparations into a synchronous fallback, replaying old documents on
the main thread after their owner had closed.

## Changes

- Prepare only when the debounced snapshot reaches its background save turn;
  the save joins immediately. Lifecycle/pagehide/navigation flushing retains
  its synchronous durable path.
- Keep one successful prepared result with at most 1 MiB of conservatively
  estimated UTF-16 JSON payload. Return oversized results to save callers
  without keeping them in the prepared cache.
- Allow one active serialization and one latest unsent speculative preparation.
  Replace only speculative work. Explicit saves keep their own snapshots, run
  in order, and share work for the same document identity.
- Discard failed speculative work without synchronous fallback. Required saves
  retain fallback while the owner is alive. Dispose settles existing save/hash
  consumers and releases queued work without replay. Explicit new calls after
  disposal retain the inline compatibility path.

Undo/Redo history, schemas, protocol, access controls, validation, durable
operation IDs, optimistic revisions and stored data are unchanged.

## Browser evidence

Baseline: main `82baf7d86df0b2bbac4d89498484e385f2e5303b`.
Linux headless Chromium 153, software graphics, DPR2, 1280×800. Each scene has
varied ink, 800 visible strokes, ten real 512×512 PNGs, sixteen completed
viewport edits, then UI clear and a completed local save. The 10k fixture uses
the established Dexie restore path because its JSON exceeds the public 10 MiB
import limit; that limit is unchanged.

| Empty canvas after full GC | Baseline MiB | Candidate MiB |
| --- | ---: | ---: |
| Fresh empty canvas | 10.5 | 10.5 |
| After 3k ink + 10 PNG, clear | 93.7 | 27.9 |
| After 10k ink + 10 PNG, clear | 263.4 | 59.6 |

Undo deliberately retains the original document. This is memory-retention
evidence, not a universal frame-rate claim. Idle rendering had no application
rAF callbacks in either version. Windows/device validation and the broader
C3.9 large-board release gate remain separate.

## Regression guards and validation

- Worker unit tests: coalescing/clear priority, old cache release with Undo
  retention, oversized result eviction, disposal/late replies, exact mandatory
  snapshots, duplicate consumers, failure/restart and in-flight hash cancellation.
- Autosave tests: prepare only the final debounced document; preserve synchronous
  pagehide/navigation flushing, optimistic revisions and operation-ID promotion.
- `tests/e2e/local-clear-memory.spec.ts`: real 3k + 10 PNG, sixteen saved viewport
  edits, clear, bounded Chromium heap, Undo/Redo, another drawing and reload.
  Firefox runs the same workflow; the CDP heap probe is Chromium-only.

Local `npm run check` covers contract generation, formatting, lint, types, unit
tests, performance budgets, architecture and build. Chromium clear-memory,
history and persistence browser tests were also run against the production build.
The diagnostic Chromium binary replaces an unavailable standard local download;
CI uses its regular Playwright installations. Exact-head CI remains the merge gate.

Issue #201 stays open. Independent viewport/renderer experiments and the
collaborative Undo replay finding are outside this local autosave fix.
