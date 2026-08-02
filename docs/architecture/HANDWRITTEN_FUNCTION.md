# Handwritten function architecture

## Ownership

| Boundary | Responsibility |
| --- | --- |
| `modules/handwritten-function` | Multi-stroke session, limits, normalization and recognizer port |
| future canvas composition | Pointer capture, Escape, tool switching and previews |
| future recognition adapter | Provider DTOs, credentials, HTTP and timeout policy |
| future expression adapter | LaTeX/JIIX conversion and `tutorboard-expression/1` validation |
| future plot composition | Coordinate-plot creation and atomic source-stroke replacement |

The PR 1 module is transient. It owns no `BoardDocument`, board command, React
component, Konva node, storage record or network request.

## Public identifiers and versions

```text
math.handwritten-function
tutorboard.handwritten-function-session/0.1
tutorboard.math-ink-request/0.1
tutorboard.math-ink-result/0.1
```

Session state is an in-memory TypeScript contract. Request and result versions
form the portable recognizer boundary and may be logged in bounded development
evidence later. None of these versions changes BoardDocument 1.1.

## Capture lifecycle

The reducer starts in `idle`. `begin` creates a collecting session with explicit
caller time and identity. `start-stroke`, `append-point` and `finish-stroke`
require the same non-negative integer pointer ID. Only one active pointer is
accepted. Completed strokes remain immutable.

`cancel-stroke` models `pointercancel`, capture loss or an explicit current-stroke
cancel. It removes the active stroke and preserves earlier strokes.
`cancel-session` models Escape or a tool switch when the complete capture should
be discarded.

`complete-input` is accepted only with at least one completed stroke and no
active pointer. It computes source bounds and enters `ready`.

## Recognition lifecycle

`recognition-started` moves `ready` to `recognizing` with a caller-generated ID.
Only a result or failure carrying the same ID can complete the operation. A late
response from an earlier provider call returns a stale-recognition diagnostic and
leaves state unchanged.

`reopen-input` returns ready, recognizing, resolved or failed input to collecting
state with the completed strokes intact. Application composition must abort the
corresponding provider operation when leaving recognizing state.

## Normalization

All completed strokes share one transform:

```text
scale = max(source width, source height, 1e-9)
normalized x = (x - minX) / scale
normalized y = (y - minY) / scale
normalized time = point time - session start time
```

The longer source axis maps to `[0, 1]`; the shorter axis preserves its aspect
ratio. Source bounds and transform metadata accompany the normalized strokes so
a future provider adapter or diagnostic view can reconstruct the mapping.

## Safety limits

The session rejects input beyond 300 seconds, 128 strokes, 4,096 points in one
stroke or 16,384 points in total. Points must be finite and chronologically
monotonic. A completed stroke must contain geometric movement.

These checks happen before appending more data. The module has no dynamic code,
network API, browser state, storage access or nondeterministic ID/time source.

## Recognizer port

```ts
interface MathInkRecognizer {
  readonly id: string;
  readonly version: string;
  recognize(
    request: MathInkRecognitionRequest,
    signal: AbortSignal,
  ): Promise<MathInkRecognitionResult>;
}
```

Providers return ordered candidates and structured diagnostics. Candidate
formats are intentionally broad enough for the planned expression-conversion
increment while keeping provider-specific response objects private to adapters.

The fake recognizer clones both request and result values, observes abort before
and after one asynchronous boundary and exposes captured requests for tests.
