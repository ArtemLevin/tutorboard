# C3.9-D · Strict-schema viewport acceptance fast path

Date: 2026-10-10 · tracked by [#201](https://github.com/ArtemLevin/tutorboard/issues/201).

## Baseline and causal finding

[C3.9-C](C39_VIEWPORT_COMMAND_COST_2026-10-10.md) established that
`reduceBoardDocument(document, core.viewport.set)` traverses the complete
BoardDocument **twice**: on entry, and again inside `accept` before return.
The history helper only manipulates up to 100 document references;
its median cost was ~0.008ms. In a 5000-stroke representative fixture,
the old isolated reducer cost was ~295–384ms on independent runners.
These measurements are not equivalent to browser rAF frame duration.

## Implementation and correctness scope

Only `src/core/board/commands/reducer.ts` changes in production:

1. `reduceBoardDocument` keeps `validateBoardDocument(document)` at the
   trusted command boundary and retains `validateMetadata(command)`.
   A mutated/untrusted document still fails `command.invalid-current-document`.
2. `setViewport` retains the finite X/Y, positive finite zoom precondition
   and original error message/code for violations (`command.invalid`).
3. A private `acceptViewport` preserves `accept`'s monotonic `updatedAt`
   normalization exactly, then uses the existing
   `boardDocumentSchema.shape.viewport.safeParse` and
   `boardDocumentSchema.shape.updatedAt.safeParse` for fields changed
   by this command. The former recursively uses strict Zod shapes for
   the offset and rejects unknown properties; the latter checks the same
   ISO datetime format as the full document schema.
4. All other document fields are retained through object spread,
   structurally sharing `objects`, `order`, groups, imports, solids,
   and learning attempts. The already-validated `updatedAt >= createdAt`
   constraint cannot regress after monotonic timestamp normalization.
5. On the same invalid output shape, `acceptViewport` returns the original
   document and `command.invalid-result`, exactly like the existing
   full validator. Other commands continue through the full `accept`
   validation path.

No persisted schema, command name, JSON format, public API, undo contract,
guest permission semantics or integration protocol is changed.
No validation cache by object identity is introduced; mutations of
externally owned objects remain detectable at the full input gate.

## Regression checks

- `tests/unit/core/c39-viewport-fast-path.test.ts` compares result
  acceptance and document contents to an independent full
  `validateBoardDocument` oracle on valid offset/zoom, old and
  timezone-offset timestamps, unknown fields on viewport/offset,
  invalid/non-finite values and bad metadata.
- It verifies corrupted input fails before the optimization and that a
  different command (`core.document.rename`) still performs complete
  output validation.
- `tests/performance/c39-viewport-command-cost.test.ts` retains
  strict rejection and populated 100-entry undo history checks,
  verifies one actual full validator call on successful viewport updates,
  and performs an interleaved ABBA 14-pair comparison on the same runner.
  The legacy arm executes actual full document input and output validators;
  the optimized arm executes the actual production reducer.
- `.github/workflows/c39-representative-baseline.yml` also triggers
  the seven-scene Chromium benchmark on reducer/test changes.

## Paired microbenchmark result

[Isolated focused workflow 38047190640](https://github.com/ArtemLevin/tutorboard/actions/runs/38047190640)
passed TypeScript, all three focused unit tests and all four performance tests.

| Scene | Old full-validation p50 | Optimized p50 | Median improvement | Old p95 | Optimized p95 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 3000 varied pen + 6 PNG + 4 GIF | 111.98 ms | 54.54 ms | **51.3%** | 157.18 ms | 58.88 ms |
| 5000 varied pen + 6 PNG + 4 GIF | 183.39 ms | 95.05 ms | **48.2%** | 217.74 ms | 133.39 ms |

The benchmark was performed on a shared Linux runner with 14 interleaved
samples for each arm of both scenes; timing precision is subject to
other runner load, JIT and GC. It establishes a material reduction in
reducer CPU work under equivalent input. The gain in *browser frame tail*
requires an independently passing Chromium run and should not be
inferred directly from the numbers above.

The remaining full **input** validator is still the dominant reducer
cost: on the optimized path p50 was **55.53ms at 3000** and
**94.99ms at 5000** strokes in the same run. This is an explicit limit
of the safe single-command change.

## Release gate and next steps

The focused test result and formatter output come from
`38047190640`; the **full CI, actual seven-scene Chromium profile,
Firefox smoke, safety and self-review gates** are required on the final
PR SHA before merge. C3.9-E should evaluate repeated browser-visible
p95/p99/max, independent compositor stalls, undo/redo, guest collaboration,
reconnect and cache/soak. C3.9-F remains the longer controlled-pilot
endurance gate. Issue #201 remains open through E/F.

A further optimization removing the first complete input validator
would alter the trust-boundary assumptions and requires separate
immutability, versioning and mutation-tolerance evidence.
