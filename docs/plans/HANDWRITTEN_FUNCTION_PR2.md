# Handwritten function PR 2 plan

## Goal

Translate provider-neutral math-ink candidates into validated
`tutorboard-expression/1` explicit functions, discover shared parameters and
produce deterministic diagnostics for application composition.

PR 2 starts with `MathInkRecognitionResult` from PR 1 and ends with an immutable
interpretation result. It does not create a board object or render a graph.

## Product boundary

The increment owns four operations:

1. decode a candidate according to its declared `plot-expression`, `latex` or
   `jiix` format;
2. remove supported equation wrappers such as `y =` and `f(x) =`;
3. discover legal parameter identifiers and validate the expression with the
   production TutorBoard compiler;
4. rank valid candidates and report accepted, ambiguous or rejected output.

The implementation remains synchronous, pure and provider-neutral. It receives
all source text as values and performs no network, storage, DOM, timer or random
operation.

## Public contract

PR 2 introduces:

```text
tutorboard.handwritten-function-interpretation/0.1
```

The public entry point is:

```ts
interpretMathInkRecognitionResult(result): HandwrittenFunctionInterpretation
```

The returned value contains:

- all successfully interpreted candidates in deterministic rank order;
- the selected candidate when the ranking is decisive;
- canonical TutorBoard expression text;
- discovered parameter names in first-occurrence order;
- source candidate index, format and confidence;
- structured conversion and compiler diagnostics;
- status `accepted`, `ambiguous` or `rejected`.

## Supported notation

### Plot expression

The existing TutorBoard notation is accepted directly after bounded cleanup:

- Unicode multiplication, division, minus, pi and superscript digits;
- optional `y =` or `f(x) =` wrapper;
- explicit and implicit multiplication already supported by
  `tutorboard-expression/1`.

### Constrained LaTeX

The converter supports the subset needed for school functions:

- grouped expressions and powers;
- `\frac{a}{b}` and `\sqrt{x}`;
- `\sin`, `\cos`, `\tan`, inverse trigonometric functions, `\ln`, `\log`,
  `\exp`, `\abs`, `\floor`, `\ceil`, `\min`, `\max`;
- `\pi`, `\cdot`, `\times`, `\div`;
- `\left`, `\right`, `\mathrm`, `\mathbf`, `\operatorname`;
- round and square delimiters.

Unknown commands, root indices, subscripts, relations, systems and malformed
brace structure produce diagnostics instead of guessed expressions.

### JIIX

JIIX input is parsed as bounded JSON. A deterministic traversal searches
recognized math fields such as `latex`, `expression`, `label`, `value` and
`text`, preferring explicit LaTeX. Depth, node count and extracted string length
are bounded. Provider-specific objects remain outside the public result.

## Wrapper and relation policy

A single outer equation may have one of these left sides:

```text
y
f(x)
```

The right side becomes the explicit function expression. Any remaining equality
or comparison operator is rejected because PR 2 produces one explicit function,
not an implicit curve, equation system or inequality.

## Parameter discovery

The converted expression is first compiled as an explicit function with no
parameters. `expression.unknown-identifier` diagnostics identify parameter
candidates using their exact source spans.

A parameter is accepted only when:

- it passes `validatePlotParameterName`;
- it is not reserved by the expression language;
- it is unique;
- the total does not exceed `maximumCoordinatePlotParameters`.

The expression is compiled again with the discovered names. Success from the
production compiler is the final validity criterion. Parameters preserve their
first textual occurrence for predictable slider ordering.

## Candidate ranking

Valid candidates are ordered by:

1. provider confidence, descending;
2. declared format preference: native plot expression, LaTeX, JIIX;
3. fewer discovered parameters;
4. original provider order.

Equivalent canonical expressions are deduplicated for ambiguity decisions. One
candidate is accepted when it is the only valid expression or exceeds the next
distinct candidate by the configured confidence margin. Otherwise the result is
ambiguous and application composition must ask for confirmation or correction.

An upstream `unrecognized` status cannot produce automatic acceptance; any valid
recovery candidate remains ambiguous.

## Resource limits

| Resource | Limit |
| --- | ---: |
| Recognition candidates | 16 |
| Candidate source length | 8,192 characters |
| Conversion nesting | 64 levels |
| JIIX nodes | 2,048 |
| JIIX depth | 48 levels |
| Extracted JIIX strings | 64 |
| Parameters | existing coordinate-plot maximum |

The generated TutorBoard expression is also constrained by the production
expression compiler limits.

## Diagnostics

Diagnostics identify the candidate index, code, severity, message and optional
source span. Codes distinguish:

- source and candidate limits;
- malformed or unsupported LaTeX;
- malformed or unsupported JIIX;
- unsupported wrappers and relations;
- invalid parameter names or counts;
- production expression diagnostics;
- ambiguity and missing valid candidates.

Provider diagnostics are preserved as interpretation-level informational,
warning or error records.

## Verification

Unit coverage must prove:

- direct plot-expression cleanup and wrapper removal;
- Unicode operator and general superscript conversion;
- nested fractions, roots, powers and function commands;
- malformed braces, unsupported commands, subscripts and relations;
- bounded JIIX extraction and malformed JSON handling;
- parameter discovery in first-occurrence order;
- reserved and invalid names remain compiler errors;
- final validation uses `tutorboard-expression/1`;
- deterministic ranking, deduplication and ambiguity;
- upstream unrecognized results cannot auto-accept;
- source, nesting, candidate and JIIX limits;
- inputs remain unmodified.

Required repository gates remain format, lint, strict TypeScript, all unit and
performance tests, architecture, production build, browser smoke, coordinate
plot production, live GeometryOS and production Smart Ink.

## Follow-up contract

PR 3 may consume only the public interpretation result. It will add the canvas
tool, recognizer orchestration, editable confirmation surface, parameter default
creation, coordinate-plot composition and atomic replacement of source ink.
