# C3.9-S6.3 — owned immutable viewport reducer: implementation and ABBA evidence

Date: 2026-10-11. Issue: [#201](https://github.com/ArtemLevin/tutorboard/issues/201).  
Experiment: [Draft PR #229](https://github.com/ArtemLevin/tutorboard/pull/229), stacked on S6.4-B Draft PR #228 (and #227/#226). No changes in `main`.

## Confirmed starting state and root cause

The public `reduceBoardDocument(document, command)` fully calls
`validateBoardDocument(document)` for every command. For `core.viewport.set`
this independently parses/validates thousands of ink objects, although
`setViewport` itself already correctly validates only the viewport,
`updatedAt` and timestamp invariant. S6.4-B dramatically reduced Worker
`postMessage` overhead but did not yield a stable >=20% improvement in the
frame p95 tail.

## Implementation

- `createOwnedViewportReducer()` is a session-scoped reducer factory used
  only by the local `useBoardDocumentController.commitCommand` path for
  `core.viewport.set`.
- On an **unrecognized document identity**, it performs the full
  `validateBoardDocument` call and takes the **independent deep parse** returned
  by Zod; this copy is recursively frozen within the core session.
- On a **recognized exact immutable revision**, it calls the existing
  `validateMetadata` and `setViewport` without traversing all objects.
  The successful revision owns and freezes a fresh viewport copy; caller
  command payloads are not frozen.
- A new/modified/hydrated document, undo/redo state, or changed content
  identity forces full validation and replacement of the session's trusted
  revision. A malformed current document still returns
  `command.invalid-current-document`. The public `reduceBoardDocument`
  continues to validate every incoming document without exception.
- No persisted schema, server protocol, permission contract, history model or
  sync queue modifications. Original input documents are not frozen in place.

Files changed: `src/core/board/commands/reducer.ts`,
`src/core/public.ts`,
`src/app/board/controllers/useBoardDocumentController.ts`,
`tests/unit/core/c39-s6-owned-viewport-reducer.test.ts`, and
`.github/workflows/c39-s6-s3-owned-abba.yml`.

## Verification

Code head `21c79d06bc1d19647469b2f571593876b3f1ee78`:

- [CI #38156646744](https://github.com/ArtemLevin/tutorboard/actions/runs/38156646744):
  the main Quality gate passed format, lint, typecheck, full unit suite,
  performance budget, architecture and production build. Chromium and Firefox
  smoke, board-only profile, GeometryOS, coordinate plot gate and production
  image also passed. Media profile pending at time of initial evidence capture.
- Unit regression test includes equivalence against public reducer output and
  canonical serialization, metadata/error parity, original document isolation,
  deep frozen owned snapshots, undo/hydration/content replacement invalidation,
  and on a dense document with 3000 ink objects **exactly one full
  prevalidation in ten consecutive viewport commits**.
- [Two-runner real-browser ABBA #38156646773](https://github.com/ArtemLevin/tutorboard/actions/runs/38156646773)
  **SUCCESS**. Each independent Chromium runner executed A1/B1/B2/A2,
  two static-heavy cases per step, DPR2, 1240x820, 18 native wheel events,
  5000 or 10000 pen strokes plus 4 PNG and 6 JPEG.

A is baseline PR #228 (original full-document reducer validation); B is the
S6.3 owned viewport implementation.

| Runner | Variant | 5k active p95 ms | 10k active p95 ms | 5k full validations | 10k full validations |
| --- | --- | ---: | ---: | ---: | ---: |
| A | A1 | 300.0 | 333.3 | 9 | 9 |
| A | B1 | 216.7 | 433.3 | 1 | 1 |
| A | B2 | 200.0 | 366.7 | 1 | 1 |
| A | A2 | 200.1 | 400.1 | 9 | 11 |
| B | A1 | 300.0 | 366.7 | 9 | 9 |
| B | B1 | 216.6 | 350.0 | 1 | 1 |
| B | B2 | 233.3 | 399.9 | 1 | 1 |
| B | A2 | 200.0 | 350.0 | 9 | 12 |

Exploratory median-of-two comparison, **baseline -> candidate**:

| Runner | 5k active p95 | 10k active p95 |
| --- | --- | --- |
| A | 250.05 -> 208.35 ms (**16.7% improvement**) | 366.7 -> 400.0 ms (**9.1% regression**) |
| B | 250.0 -> 224.95 ms (**10.0% improvement**) | 358.35 -> 374.95 ms (**4.6% regression**) |

Total synchronous full-prevalidation duration summed over two samples:

- Runner A 5k 2038 -> 253ms (~87.6% less), 10k 4493 -> 464ms
  (~89.7% less).
- Runner B 5k 2401 -> 239ms (~90.0% less), 10k 4843 -> 472ms
  (~90.2% less).

This prevalidation time reduction is **directly observed** in tracing and
compares an identical kind of span across variants. The `freezeGraph` phase
after first validation was **not separately instrumented** in this candidate.
It is plausible, but **not yet demonstrated**, that its one-off work,
temporary deep copy, scene invalidation and/or remaining Konva scene/hit
rendering offset some of the main-thread validation savings. Sampling noise
and workload differences can also contribute. We cannot conclude an
exclusive frame-time attribution from interval sums.

## Safety and compatibility caveats

The trusted session owns a recursively frozen **Zod-cloned** document. It
cannot silently reflect mutations of the external original, and a different
root identity triggers full revalidation. The incoming command viewport is
copied before the new trusted document is frozen.

External callers of `BoardDocumentWorkerComputation` can still provide
non-owned mutable content; **S6.4-B's general Worker cache is not yet
proven safe against all such untrusted mutations**. That separate
data-integrity blocker remains open and prevents merging the full stack.
A full browser heap/memory soak and restore/reconnect/guest collaboration
regressions remain independent production gates.

## Decision and next action

**S6.3 functional/quality GO; production performance NO-GO.** Both independent
runners fail the >=20% `active p95` improvement requirement at both
5k and 10k. The 10k tail regresses slightly even though full validation
work is greatly reduced. Keep PR #229 **Draft**, do not merge the experimental
stack into `main`, and keep Issue #201 OPEN.

Next bounded investigation: instrument the one-off independent clone +
recursive freeze duration, compare the scene/hit and autosave intervals
frame-by-frame using clipped union, check whether the first viewport
commit/scene reference change triggers media redraw, and measure Worker heap
stability. Preserve public reducer validation and all lifecycle/sync contracts.
