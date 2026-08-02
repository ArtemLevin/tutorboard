# ADR-022 — Handwritten function session boundary

## Status

Accepted for handwritten-function PR 1.

## Context

TutorBoard already recognizes one geometric stroke through Smart Ink and already
renders safe coordinate plots from textual expressions. A handwritten formula
has a different input topology: it consists of several ordered strokes whose
relative placement carries mathematical meaning. Reusing the geometric
single-stroke recognizer would merge unrelated responsibilities and would
conflict with its calibrated policy that treats formulas as negative examples.

The first increment needs a stable boundary that can later support a cloud
recognizer, a local model or deterministic tests without coupling the board
document to any provider DTO or temporary pointer state.

## Decision

- Introduce `modules/handwritten-function` as a transient feature module.
- Publish `math.handwritten-function` as the future application tool ID.
- Use a pure reducer for multi-stroke capture and recognition lifecycle state.
- Require caller-generated session, stroke and recognition IDs and caller-owned
  timestamps.
- Keep one active pointer at a time and reject mismatched pointer actions.
- Preserve completed strokes when the current stroke is cancelled.
- Bound duration, strokes and points before allocating additional input.
- Complete input into immutable strokes plus deterministic world-space bounds.
- Normalize all strokes together with one aspect-preserving transform.
- Keep relative stroke timing in the provider request.
- Define a provider-neutral asynchronous recognizer port with `AbortSignal`.
- Version request and result contracts independently from BoardDocument.
- Keep provider outputs as candidates in `plot-expression`, `latex` or `jiix`.
- Protect asynchronous completion with recognition IDs.
- Provide a deterministic fake recognizer in the feature module.
- Keep React, Konva, DOM events, networking, storage and BoardDocument outside
  this increment.

## Consequences

Future UI code can collect strokes without changing the persisted document
schema. A recognizer adapter can be replaced without changing session logic.
PR 2 can normalize provider output into `tutorboard-expression/1`, and PR 3 can
build a coordinate plot through existing APIs.

The first PR does not provide a user-visible tool. This is intentional: the
capture and provider contracts can be tested independently before canvas event
composition and credential-bearing adapters are introduced.

Cancelling an in-flight recognition operation requires both aborting its
`AbortController` in application composition and moving the reducer away from
the matching recognition ID. A late provider response then has no applicable
state transition.
