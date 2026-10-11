# C3.9-D · Safe viewport-only output validation

Date: 2026-10-10 · [issue #201](https://github.com/ArtemLevin/tutorboard/issues/201).
Base main: `1bf2487d814a8dacde0ddc55ac57678f0b7b65c1`.

## Root cause and minimal production change

[C3.9-C CPU attribution](C39_VIEWPORT_COMMAND_COST_2026-10-10.md)
confirmed that both `reduceBoardDocument` input validation and
`accept` output validation recursively traverse every pen, image, layer
and cross-reference even for `core.viewport.set`. On dense scenes
this added 194–384 ms of reducer CPU time (independent Linux runs);
a full 100-entry immutable history commit took only ~0.008 ms.

The C3.9-D change is limited to `setViewport()`:

1. **Keep** `reduceBoardDocument`'s existing full validation of the input
   `BoardDocument` and unchanged command metadata validation.
2. Keep the prior command-specific checks (finite offset and positive finite
   zoom) and the exact old `command.invalid` failure.
3. Share the existing `accept` timestamp normalization through
   `normalizeUpdatedAt`, retaining the old monotonic `updatedAt` behavior.
4. Parse only the changed `viewport` through
   `boardDocumentSchema.shape.viewport.safeParse`, which uses the **same
   strict Zod schema** as `validateBoardDocument`, including unknown-key
   rejection at viewport and offset levels.
5. Validate the resulting timestamp using
   `boardDocumentSchema.shape.updatedAt.safeParse`, then check the
   established `updatedAt >= createdAt` cross-field invariant.
6. Construct the new document by shallow copy, preserving references to
   unchanged `objects`, `order`, groups, imports and other content.
   Content-changing commands continue to call the original full `accept`
   validator without alteration.

The explicit security/trust boundary remains the incoming full document.
There is **no identity-keyed validity cache**, no schema migration, and no
change to URL, guest permissions, storage or collaboration protocol.

## Regression guard

`tests/unit/core/c39-viewport-fast-path.test.ts` compares the new command
against the legacy full-document output validation of the *same candidate*,
including valid fractional/large offsets, zoom extrema, old timestamp
normalization, unknown viewport/offset properties and invalid metadata.
It verifies exact rejection codes, document identity on failure,
unchanged object/order references, persisted document validity, and
history undo/redo.

`tests/performance/c39-viewport-command-cost.test.ts` now verifies a
successful viewport command invokes the original **full** validator
**exactly once**. On the same fixture and test iteration it also measures
a separate second full validation as a paired reference cost. This is
a controlled approximation of the removed legacy `accept` pass, **not**
an independently timed old reducer binary.

## First verified focused comparison

[GitHub Actions focused run 38047172922](https://github.com/ArtemLevin/tutorboard/actions/runs/38047172922):
**17 unit tests and 28 performance tests passed**, TypeScript typecheck passed.
The following are medians on one shared Linux runner, after two warmups
and seven samples, with six 1×1 PNG and four 1×1 GIF entries per scene.
This measures document CPU cost, excluding browser rendering and actual
image decoding.

| Stroke objects | New reducer p50 | Paired reference including removed full validation p50 | Median paired reduction |
| ---: | ---: | ---: | ---: |
| 300 | 6.9 ms | 15.5 ms | 45.1% |
| 1000 | 18.9 ms | 37.9 ms | 49.0% |
| 3000 | **70.6 ms** | **146.3 ms** | **50.0%** |
| 5000 | **104.5 ms** | **204.3 ms** | **50.2%** |

The paired-reference percentile includes optimized reducer plus an extra
full validator call; it closely approximates the original CPU algorithm,
but it is **not a production A/B frame-time result**.
The first input validation remains expensive. Any follow-up reduction
must maintain invalid-input rejection and rely on enforced immutability
and trusted state ownership, never assumed object identity.

## Browser and release gate

`.github/workflows/c39-representative-baseline.yml` is now triggered by
changes to the reducer, so every viewport performance change exercises
all seven mixed-media scenes at DPR1/2 with full Chromium trace evidence.
Compare the same fixture and browser environment against prechange
C3.9-A/C3.9-B benchmarks, understanding inter-run variance and
instrumentation overhead. Additional CI gates: complete unit/performance,
format, lint, typecheck, production build, Chromium and Firefox smoke,
raster/media, GeometryOS, security, and collaboration checks.
Report actual results with exact SHA and action links; never claim
improvement in frame tails unless verified.

## Remaining work

The viewport reducer still performs one mandatory full current-document
validation, so large documents may still cause visible wheel-commit stalls.
Compositor and LayerTree stalls in C3.9-B are a separate cause.
C3.9-E will evaluate end-user release gates and optimization options based
on measured per-frame evidence; C3.9-F covers soak/rollback and pilot.
