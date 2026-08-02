# Handwritten function PR 1 plan

## Goal

Create the provider-neutral transient foundation for writing a mathematical
function with several pen strokes and sending one normalized capture to a later
recognition provider. This increment deliberately stops before toolbar, canvas,
network and coordinate-plot composition.

## Product boundary

PR 1 owns the lifecycle from the first pointer sample through a completed ink
capture and a versioned recognition result. The board document remains at 1.1.
No handwriting session, active pointer, normalized request or recognition result
is persisted.

The public tool identifier is `math.handwritten-function`. Application wiring in
a later PR will map pointer, `pointercancel`, Escape and tool-switch events into
the pure session reducer.

## Scope

1. Add a dedicated `modules/handwritten-function` boundary.
2. Define versioned session, request and result contracts.
3. Collect multiple ordered strokes with explicit pointer ownership.
4. Support active-stroke cancellation, whole-session cancellation and reopening
   after recognition for correction.
5. Enforce bounded session duration, stroke count, points per stroke and total
   point count before allocation.
6. Reject non-finite, time-reversing and degenerate input.
7. Compute world-space bounds once input is completed.
8. Normalize all strokes into one aspect-preserving unit coordinate space while
   retaining source bounds and the inverse transform metadata.
9. Define an asynchronous `MathInkRecognizer` port using `AbortSignal`.
10. Provide an abort-safe deterministic fake recognizer for tests and future UI
    composition.
11. Protect recognition state with caller-generated IDs so stale completions
    cannot replace a newer operation.
12. Add architecture documentation, an ADR and focused unit coverage.

## Non-goals

- recognizer vendor selection or credentials;
- HTTP adapters or direct browser networking;
- LaTeX, JIIX or expression normalization;
- formula compilation;
- coordinate-plot creation;
- toolbar registration or canvas rendering;
- BoardDocument, command or collaboration changes;
- production feature flags and browser release gates.

## State model

```text
idle
  -> collecting
  -> ready
  -> recognizing
  -> resolved | failed

ready | recognizing | resolved | failed
  -> collecting (correction)

any active state
  -> idle (cancel session)
```

Only `collecting` may own an active pointer. A finished stroke becomes immutable
session input. Cancelling an active stroke discards that stroke while preserving
previous completed strokes.

## Resource budgets

| Budget | Limit |
| --- | ---: |
| Session duration | 300,000 ms |
| Strokes | 128 |
| Points per stroke | 4,096 |
| Total points | 16,384 |

The limits cover normal handwritten formulas while bounding memory and provider
payload size. Later corpus evidence may refine them through a versioned decision.

## Recognition boundary

`MathInkRecognizer` receives a `tutorboard.math-ink-request/0.1` value and an
`AbortSignal`. The request contains normalized stroke points, relative timing,
source bounds and transform metadata. It contains no board document, user
identity, lesson identity, DOM event or provider-specific DTO.

The provider returns `tutorboard.math-ink-result/0.1` with a recognized,
ambiguous or unrecognized status, ordered candidates and structured diagnostics.
Candidate formats are `plot-expression`, `latex` and `jiix`; conversion belongs
to PR 2.

## Verification

Unit tests must prove:

- multiple strokes complete as one capture;
- pointer mismatch cannot mutate another pointer's stroke;
- pointer cancellation discards only the active stroke;
- a dot or repeated point sequence is rejected;
- duration, stroke and point limits are enforced;
- source bounds and aspect-preserving normalization are deterministic;
- stale recognition IDs are ignored;
- resolved and failed input can be reopened for correction;
- whole-session cancellation returns to idle;
- the fake provider copies requests and results;
- cancellation works before and during the async boundary.

The repository `format`, `lint`, `typecheck`, `test`, `architecture` and `build`
gates remain mandatory before merge.

## Follow-up contract

PR 2 may consume only the public module contract. It will translate LaTeX/JIIX
candidates into `tutorboard-expression/1`, surface diagnostics and discover
parameters. PR 3 will compose the accepted expression with a coordinate plot and
replace source strokes atomically through `core.objects.replace`.
