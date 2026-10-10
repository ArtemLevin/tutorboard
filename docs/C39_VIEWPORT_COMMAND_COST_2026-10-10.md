# C3.9-C · Root cause: full-document validation on viewport commands

Date: 2026-10-10 · [issue #201](https://github.com/ArtemLevin/tutorboard/issues/201).
Base: main `5e91bc092288fbb5d91313f1f52afe39bd441a9e`
(C3.9-A and C3.9-B already merged).

## Observable failure and scope

C3.9-B [trace report](C39_FRAME_ATTRIBUTION_2026-10-10.md)
found synchronous `wheel-viewport-persist` timings around **150–161 ms**
at 3000 strokes and as high as **241.9 ms** at 5000 strokes on a
shared Chromium runner. Cache teardown and GIF activation took ~0–0.1 ms.
Several compositor/LayerTree events overlap other long rAF windows.
This C3.9-C block isolates CPU work and preserves production behavior;
a performance fix belongs to C3.9-D.

## Actual command path

```text
BoardStage.commitWheel()
  → App.commitViewport(viewport)
    → useBoardDocumentController.commitCommand(core.viewport.set)
      → reduceBoardDocument(previousDocument, command)
         → validateBoardDocument(previousDocument)      [FULL pass 1]
         → validateMetadata(command)
         → setViewport(): copy document and viewport
         → accept(): validateBoardDocument(nextDocument) [FULL pass 2]
      → documentRef.current = nextDocument
      → setState(previous =>
           commitDocumentHistory(previous.history, nextDocument))
      → onCommandCommitted callback (persistence/collab integration)
```

Both `validateBoardDocument` calls perform a `boardDocumentSchema.safeParse`
and semantic checks of order, object identity, groups, geometry imports,
ink data, plots, solid models and timestamps. Neither validator is
bounded by the viewport's size. The history helper retains immutable
document **references** (limit 100), slicing only the 100-reference array.

## Experiment — actual reducer, actual validator

Added `tests/performance/c39-viewport-command-cost.test.ts`.
The benchmark intercepts the reducer's existing import of
`validateBoardDocument` **inside the Vitest test only**, measures the
two original calls separately, and times the original history helper
after each reducer call. No production reducer or validator is mocked
or changed; `vi.mock` wraps and invokes the actual validator.
Fixtures use 300/1000/3000/5000 geometrically varied VectorInk
strokes, six PNG, four GIF, mixed z-order and a populated 100-entry
history. Only 1×1 media payloads are used: this experiment isolates
document-validation CPU rather than media decoding. Each size has two
unmeasured warmup iterations and seven samples. Time is measured with
`performance.now()` on one shared Linux Actions worker.

[Successful isolated workflow 38041867449](https://github.com/ArtemLevin/tutorboard/actions/runs/38041867449)
ran 13 performance test files / 27 tests successfully and passed TypeScript
typecheck (the temporary workflow was removed from the branch afterward).

| Pen strokes | reducer p50, ms | input validation p50 | result validation p50 | 100-entry history p50 | validation share, median |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 300 | 24.763 | 12.018 | 9.638 | 0.0077 | 99.775% |
| 1000 | 65.899 | 26.775 | 27.874 | 0.0072 | 99.945% |
| 3000 | **206.229** | 109.013 | 95.903 | 0.0082 | **99.979%** |
| 5000 | **384.085** | 193.426 | 188.020 | 0.0084 | **99.988%** |

These medians describe distinct distributions and are **not additive**
sample by sample. The share is the median of each sample's
`(inputValidationMs + resultValidationMs) / reducerMs`.
The benchmark is CPU-only; it excludes React layout, Konva and compositor,
and command-committed persistence/network callbacks. Its absolute time
can differ materially from browser timings on other runner machines.
It provides direct causal evidence that two full validations dominate
the synchronous reducer work. The history helper has negligible
incremental cost in this measured setup.

## Regression/safety experiment

The same focused test proves:
- exactly two actual full validations occur on successful viewport commands;
- invalid *current* documents with duplicate object IDs in `order`
  still return `command.invalid-current-document`, preserving input;
- invalid viewport zoom (`-1`) still returns `command.invalid`;
- successful viewport commands structurally share existing `objects`
  and `order` references and use history at its configured 100-entry limit.

No validation is suppressed, no test is skipped, and no mutation
or persistence protocol is changed in C3.9-C.

## C3.9-D decision — bounded safe optimization

**Root cause:** two full `BoardDocument` traversals on an update limited to
`viewport` and `updatedAt`. **Secondary independent issue:** compositor
and LayerTree stalls remain in other slow frame windows.

Recommended one-change experiment for C3.9-D:

1. Preserve `reduceBoardDocument`'s full **input validation** and metadata
   validation to retain `command.invalid-current-document` / invalid
   command behavior even for untrusted or externally mutated documents.
2. For `core.viewport.set` only, investigate a **specialized acceptance**
   path after validated input, using validated finite offsets / positive
   zoom, monotonic `updatedAt`, and the proven invariant that every other
   field is referenced unchanged. Preserve every existing error result.
   Compare full `validateBoardDocument` equivalence for generated
   valid/invalid viewports and documents before removing the second pass.
   Do not reuse such a shortcut for content-changing commands.
3. Benchmarked elimination of one full pass is expected to improve the
   synchronous reducer cost by roughly one validation's contribution;
   this is a **prediction**, not a measured production speedup.
4. Re-evaluate the remaining first validation. Avoid caching validation
   solely by object identity unless immutability and trust boundaries
   are enforced, including mutations through external consumers/imports.
   Invalid-document rejection must continue to work.
5. Run controlled A/B/A or ABBA browser profiles at fixed DPR,
   300/1000/3000/5000 strokes, visible density, GIF/z-order combinations
   and equivalent interaction paths. Measure `wheel-viewport-persist`,
   per-frame tails and independent browser/Compositor events.
6. Preserve undo/redo, guest synchronization, import/export, permission
   checks, durable persistence and precise rejection codes. Apply all
   full correctness, regression, security and release gates. Back out a
   shortcut if semantics diverge.

Only proceed from C3.9-D to C3.9-E when a production optimization
demonstrates lower critical-path latency and passes functional tests.

## Remaining limitations

The two samples before this experiment came from different headless
Chromium runs; this profiling run is an isolated Linux/Vitest experiment.
More independent runs and a production browser A/B test are required
to establish stable percentiles and actual user-visible gains.
The controlled-pilot 24h soak/restart/recovery remains tracked separately
under C3.9-F; it was not executed here.
