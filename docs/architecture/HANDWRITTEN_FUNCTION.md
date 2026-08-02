# Handwritten function architecture

## Ownership

| Boundary | Responsibility |
| --- | --- |
| `modules/handwritten-function` | Multi-stroke session, recognition contracts, bounded syntax conversion, production expression validation and candidate ranking |
| `app/App` | Toolbar entry, pointer routing, operation cancellation, editable confirmation, accessibility and history composition |
| `app/handwritten-function-composition` | Pure stroke materialization, draft validation, coordinate-plot construction and replace-command creation |
| `app/HandwrittenFunctionPanel` | Non-modal review, candidate choice, manual correction and build controls |
| `adapters/math-ink-http` | Same-origin `MathInkRecognizer`, browser timeout, abort propagation and bounded proxy-response validation |
| `services/math-ink-proxy` | Mathpix DTOs, credentials, privacy metadata, upstream timeout/retry, load guards and sanitized diagnostics |

The feature module remains transient. It owns no `BoardDocument`, board command,
React component, Konva node, storage record or network request. It imports
production math semantics only through `../../core/public`.

## Public identifiers and versions

```text
math.handwritten-function
tutorboard.handwritten-function-session/0.1
tutorboard.math-ink-request/0.1
tutorboard.math-ink-result/0.1
tutorboard.handwritten-function-interpretation/0.1
tutorboard.math-ink-proxy-result/0.1
```

Session state is an in-memory TypeScript contract. Recognition request, provider
result, proxy result and interpretation versions are independent from
BoardDocument 1.1.

## Capture lifecycle

The reducer starts in `idle`. `begin` creates a collecting session with explicit
caller time and identity. `start-stroke`, `append-point` and `finish-stroke`
require the same non-negative integer pointer ID. Only one active pointer is
accepted. Completed strokes remain immutable.

`cancel-stroke` models `pointercancel`, capture loss or an explicit current-stroke
cancel. It removes the active stroke and preserves earlier strokes.
`cancel-session` discards a complete transient capture when the caller explicitly
chooses that policy.

`complete-input` is accepted only with at least one completed stroke and no
active pointer. It computes source bounds and enters `ready`.

Application composition uses preservation semantics for Escape and tool changes:
completed strokes are materialized before the session is closed.

## Recognition lifecycle

`recognition-started` moves `ready` to `recognizing` with a caller-generated ID.
Only a result or failure carrying the same ID can complete the operation. A late
response from an earlier provider call returns a stale-recognition diagnostic and
leaves state unchanged.

`reopen-input` returns ready, recognizing, resolved or failed input to collecting
state with the completed strokes intact. Application composition aborts the
corresponding provider operation when leaving recognizing state.

`App` accepts an optional `MathInkRecognizer`. Provider absence activates the
manual correction path after source ink has been saved.

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

Every manual edit is wrapped as one native recognition candidate and passed
through the same interpretation pipeline.

## Candidate ranking

Valid candidates are ordered by confidence, source format preference, parameter
count and provider index. Canonically equivalent expressions are collapsed for
ambiguity decisions while remaining visible in the candidate list.

One candidate becomes selected when it is unique or has a decisive confidence
lead. Close distinct candidates produce `ambiguous`. An upstream `unrecognized`
status also requires confirmation even when one converted candidate compiles.

## Canvas workflow

```text
transient strokes
  -> one core.objects.add command
  -> recognition or manual draft
  -> interpreted candidate
  -> transient coordinate-plot preview
  -> one core.objects.replace command
```

The dedicated `math.handwritten-function` tool is exposed through the toolbar and
shortcut `F`. BoardStage supplies world-space samples to the session reducer.
Transient pen-stroke objects render through the normal registry before source ink
is persisted.

The confirmation panel remains non-modal. It shows workflow state, source stroke
count, valid candidates, expression text, discovered parameters and diagnostics.

## Source ink and history

Completed strokes are materialized as ordinary user `drawing.pen-stroke` objects
in one command. Their IDs remain bounded and deterministic; the composition
helper validates caller IDs and provides a compact stroke-derived fallback when a
factory exceeds the BoardDocument identifier contract.

The graph command contains exact persisted stroke snapshots as `originals` and
one coordinate plot as the replacement. The reducer verifies those snapshots.
One undo restores every source stroke, and one redo restores the graph.

Recognition failure, provider absence, Escape and tool changes preserve completed
ink. Explicit clear removes persisted source objects through a delete command.

## Coordinate-plot composition

A graph is created from the source-ink center using the default coordinate-plot
object. Composition then:

- retains one explicit series;
- assigns the validated expression;
- creates parameters in first-occurrence order;
- uses parameter defaults `min=-10`, `max=10`, `value=1`, `step=0.1`;
- names the series `Рукописная функция`;
- fits the coordinate viewport through `fitCoordinatePlotDefinition`.

The preview and final object share the same definition. The preview uses reduced
opacity and stays outside BoardDocument.

## Mathpix adapter path

```text
App
  -> MathInkRecognizer
  -> adapters/math-ink-http
  -> POST /api/v1/math-ink/recognize
  -> Nginx
  -> services/math-ink-proxy
  -> POST https://api.mathpix.com/v3/strokes
```

The browser adapter accepts only a same-origin base path. It serializes the
versioned TutorBoard request, applies a 15-second operation timeout, propagates the
caller's `AbortSignal`, bounds request and response bodies and validates both
success and problem DTOs before returning a recognition result.

The browser bundle contains no provider credentials or provider-specific request
shape. `ProductShell` passes the recognizer into local and synchronized
workspaces through the existing optional `App` port.

## Proxy contract and provider translation

The proxy exposes `POST /v1/recognize`. Nginx publishes the same operation at
`/api/v1/math-ink/recognize`.

Normalized coordinates are converted into Mathpix integer arrays:

```text
mathpix x = round(normalized x * 10_000)
mathpix y = round(normalized y * 10_000)
```

Stroke order and point order are preserved. The provider payload uses the
Mathpix double-nested `strokes.strokes.x/y` shape, requests `latex_styled` and
`text`, and always sends:

```json
{
  "metadata": {
    "improve_mathpix": false
  }
}
```

`latex_styled` has priority over `text`. Only matching outer math delimiters are
removed. The normalized candidate enters the feature module as `format: "latex"`
and remains subject to the PR 2 conversion and compiler limits.

## Proxy reliability and load protection

The proxy owns `MATHPIX_APP_ID` and `MATHPIX_APP_KEY`. They stay outside Vite
variables, image build arguments, response bodies and structured logs.

Each provider attempt has a 10-second timeout covering headers and body. At most
one retry is allowed for transport failure, HTTP 429 and HTTP 502/503/504.
Numeric `Retry-After` values are capped at two seconds. Caller disconnect,
service shutdown and browser abort propagate to the upstream operation.

The service rejects work beyond:

- 256 KiB request or response body;
- 128 strokes;
- 4,096 points per stroke;
- 16,384 points total;
- four concurrent upstream requests by default;
- 30 requests per client per minute by default.

Concurrency overflow fails immediately; the service introduces no unbounded
queue. Stable RFC 9457-style problem codes describe validation, quota,
authentication, provider and timeout failures.

Structured logs contain request ID, duration, outcome and status. Coordinates,
expressions, provider response bodies and credentials are excluded.

## Feature exposure

`VITE_FEATURE_HANDWRITTEN_FUNCTIONS` follows the shared boolean flag parser.
Development and test enable the workflow by default. Production requires an
explicit enable value. Read-only boards disable the toolbar entry and mutating
controls.

`VITE_FEATURE_MATH_INK_RECOGNITION` is disabled by default in every stage.
Automatic recognition is composed only when both handwritten functions and math
ink recognition are enabled. `VITE_MATH_INK_API_BASE_URL` accepts only a
same-origin path and defaults to `/api/v1/math-ink`.

## Deployment boundary

`Dockerfile.math-ink-proxy` creates a dedicated Node 24 non-root image. The proxy
supports read-only filesystems and exposes `/healthz` and `/readyz`. Readiness
requires configured Mathpix credentials.

The TutorBoard Nginx image forwards only the exact recognition path to the
optional service. The handwritten tool and manual correction workflow remain
usable when the proxy is absent or automatic recognition is disabled.

## Safety limits

The capture session rejects input beyond 300 seconds, 128 strokes, 4,096 points
in one stroke or 16,384 points in total.

Interpretation additionally limits recognition candidates, source length,
conversion depth, JIIX depth, JIIX nodes and extracted JIIX strings. The final
expression remains subject to all `tutorboard-expression/1` token, AST, length
and evaluation limits.

The feature module has no dynamic code, direct network API, browser state,
storage access, scheduler dependency or nondeterministic ID/time source.
Application composition owns browser state and injects all external operations.
Provider networking is confined to the adapter and proxy boundaries.

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
one asynchronous boundary and exposes captured requests for tests. The production
adapter implements the same port through the TutorBoard-owned proxy contract.
