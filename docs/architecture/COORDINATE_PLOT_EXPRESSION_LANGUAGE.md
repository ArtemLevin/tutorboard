# Coordinate plot expression language

TutorBoard evaluates coordinate-plot formulas with the versioned local language
`tutorboard-expression/1`. The implementation is a pure TypeScript module with
no React, Konva, DOM, network, dynamic-code or persistence dependency.

## Pipeline

```text
source
  → bounded Unicode normalization
  → tokenizer with original-source spans
  → Pratt parser
  → contextual semantic validation
  → opaque compiled expression
  → budgeted evaluator
```

`BoardDocument 1.1` continues to store only the original source strings and the
language version. Tokens, AST nodes and compiled expressions remain in memory.
A malformed formula therefore cannot prevent the surrounding board document
from loading or block unrelated series.

## Grammar

```text
expression     → addition
addition       → multiplication (("+" | "-") multiplication)*
multiplication → unary (("*" | "/" | implicit-multiplication) unary)*
unary          → ("+" | "-") unary | power
power          → primary ("^" unary)?
primary        → NUMBER
               | IDENTIFIER
               | FUNCTION "(" arguments? ")"
               | "(" expression ")"
arguments      → expression ("," expression)*
```

Exponentiation is right-associative. Unary signs bind below exponentiation, so
`-x^2` means `-(x^2)` and `2^3^2` means `2^(3^2)`.

Implicit multiplication supports common school notation:

```text
2x
3sin(x)
2(x + 1)
(x + 1)(x - 1)
a x^2
pi x
```

Functions always require parentheses. `sin x` produces a diagnostic.

## Normalization

The normalizer preserves a map to original UTF-16 source offsets so diagnostics
can highlight the user's text after expanding symbols.

```text
π   → pi
×   → *
·   → *
⋅   → *
÷   → /
−   → -
x²  → x^2
x³  → x^3
```

Numbers use a decimal point and may use scientific notation. A decimal comma is
reserved for future locale-aware editor preprocessing because comma separates
function arguments.

## Names and contexts

Constants:

```text
pi
e
```

Built-in functions:

```text
sin cos tan asin acos atan sqrt abs exp ln log floor ceil min max
```

`ln` is the natural logarithm and `log` is base ten. Trigonometric functions use
radians. `min` and `max` accept from two through eight arguments; every other
function accepts exactly one.

Expression contexts enforce independent variables:

| Context | Independent variable |
| --- | --- |
| `explicit-function` | `x` |
| `explicit-domain` | none |
| `parametric-x` | `t` |
| `parametric-y` | `t` |
| `parametric-range` | none |

Coordinate-plot parameters are additionally available in every context. Their
names must start with a Latin letter, contain only Latin letters, digits or
underscores, and avoid constants, independent variables and function names.

## Evaluation results

Evaluation never throws for user-authored mathematical input. It returns one of:

- a finite numeric value;
- an undefined domain point;
- a division-by-zero point;
- a non-finite point;
- an operation-budget result;
- a sorted list of missing bindings.

The later adaptive sampler converts undefined results into curve breaks.

## Bounds

- source length: 2,000 UTF-16 code units;
- tokens: 1,024;
- AST nodes: 1,024;
- AST depth: 64;
- function arguments: 8;
- evaluator operations: 2,048.

These limits are checked before or during allocation and recursion. One invalid
expression has no effect on sibling plot series.

## Security boundary

The expression module contains no `eval`, `Function`, dynamic import, property
access, assignments, strings, arrays, objects, indexing, optional chaining,
loops or user-defined functions. Built-ins are selected from closed typed tables.
An architecture test enforces relative imports and rejects dynamic-code APIs in
all production files under `src/core/plot-expression`.

## Public API

```ts
compilePlotExpression(source, options)
evaluatePlotExpression(compiled, bindings)
normalizePlotExpression(source)
```

`CompiledPlotExpression` is opaque. Samplers can retain and evaluate it without
depending on the AST representation.
