# Handwritten function architecture

## Ownership

| Boundary | Responsibility |
| --- | --- |
| `modules/handwritten-function` | Multi-stroke session, recognition contracts, bounded syntax conversion, production expression validation and candidate ranking |
| future canvas composition | Pointer capture, Escape, tool switching and previews |
| future recognition adapter | Provider DTOs, credentials, HTTP and timeout policy |
| future plot composition | Coordinate-plot creation and atomic source-stroke replacement |

The module is transient. It owns no `BoardDocument`, board command, React
component, Konva node, storage record or network request. It imports production
math semantics only through `../../core/public`.

## Public identifiers and versions

```text
math.handwritten-function
tutorboard.handwritten-function-session/0.1
tutorboard.math-ink-request/0.1
tutorboard.math-ink-result/0.1
tutorboard.handwritten-function-interpretation/0.1
```

Session state is an in-memory TypeScript contract. Recognition request, provider
result and interpretation versions are independent from BoardDocument 1.1.

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

## Stroke normalization

All completed strokes share one transform:

```text
scale = max(source width, source height, 1e-9)
normalized x = (x - minX) / scale
normalized y = (y - minY) / scale
normalized time = point time - session start time
```

The longer source axis maps to `[0, 1]`; the shorter axis preserves its aspect
ratio. Source bounds and transform metadata accompany the normalized strokes.

## Interpretation pipeline

```text
MathInkRecognitionResult
  -> bounded candidate decoding
  -> wrapper and notation conversion
  -> compile without parameters
  -> discover unknown identifiers
  -> validate parameter names
  -> compile with parameters
  -> deterministic ranking
  -> accepted | ambiguous | rejected
```

### Native plot expressions

Native candidates keep TutorBoard syntax. The bridge removes `y =` or `f(x) =`,
normalizes Unicode operators and general superscript digits, then delegates all
semantics to `compilePlotExpression`.

### LaTeX

A recursive bounded reader translates the supported school-mathematics subset:
fractions, square roots, powers, grouping, standard functions, pi, multiplication
and division commands. Unsupported commands, root indices, subscripts,
comparisons and malformed groups receive conversion diagnostics.

### JIIX

JIIX is parsed as JSON and traversed with explicit depth, node and string limits.
Recognized fields are searched in deterministic priority order. The extracted
text is routed through the same LaTeX or native conversion path. Provider object
shape does not escape the module.

## Parameter discovery

The first production compile uses an empty parameter list. Exact spans from
`expression.unknown-identifier` diagnostics provide parameter candidates.
Candidates preserve first textual occurrence, pass `validatePlotParameterName`
and remain within `maximumCoordinatePlotParameters`.

A second compile with those names must succeed. Conversion output that fails the
production compiler never becomes an interpreted candidate.

## Candidate ranking

Valid candidates are ordered by confidence, source format preference, parameter
count and provider index. Canonically equivalent expressions are collapsed for
ambiguity decisions while remaining visible in the candidate list.

One candidate becomes selected when it is unique or has a decisive confidence
lead. Close distinct candidates produce `ambiguous`. An upstream `unrecognized`
status also requires confirmation even when one converted candidate compiles.

## Safety limits

The capture session rejects input beyond 300 seconds, 128 strokes, 4,096 points
in one stroke or 16,384 points in total.

Interpretation additionally limits recognition candidates, source length,
conversion depth, JIIX depth, JIIX nodes and extracted JIIX strings. The final
expression remains subject to all `tutorboard-expression/1` token, AST, length
and evaluation limits.

The module has no dynamic code, direct network API, browser state, storage access,
scheduler dependency or nondeterministic ID/time source.

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

The fake recognizer clones requests and results, observes abort before and after
one asynchronous boundary and exposes captured requests for tests.

## PR 3 composition boundary

Application composition will own the recognizer operation, editable confirmation
surface and graph construction. It may consume `HandwrittenFunctionInterpretation`
without parsing provider formats or repeating expression validation.
