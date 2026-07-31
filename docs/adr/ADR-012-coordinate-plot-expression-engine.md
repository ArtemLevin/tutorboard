# ADR-012 — Coordinate plot expression engine

## Status

Accepted for the coordinate-plot PR 2 increment.

## Context

`BoardDocument 1.1` stores first-class `math.coordinate-plot` objects containing
explicit and parametric formula strings. TutorBoard needs deterministic offline
formula evaluation before it can sample and render curves. Executing source as
JavaScript would expose global objects, make complexity unbounded, weaken
browser parity and couple document compatibility to JavaScript syntax.

A general third-party computer-algebra package would add a large runtime and a
language surface beyond the school-plotting scope. It would also reduce control
over diagnostics, source spans and operational budgets.

## Decision

- Implement `tutorboard-expression/1` as a pure TypeScript tokenizer, Pratt
  parser, semantic compiler and evaluator.
- Keep the persisted representation as source strings plus the existing
  language version. AST and compiled forms remain transient.
- Use a closed operator, constant and function allowlist.
- Support explicit and parametric expression contexts with shared plot
  parameters.
- Preserve original source offsets through Unicode normalization.
- Return structured diagnostics and controlled undefined evaluation results.
- Enforce length, token, AST-node, AST-depth, arity and operation budgets.
- Keep the engine independent of React, Konva, DOM, storage and networking.
- Keep parser compilation outside BoardDocument validation so one malformed
  series cannot prevent document recovery or editing.
- Add no runtime dependency.

## Consequences

The next adaptive-sampler increment receives a deterministic synchronous API and
can later move evaluation into a Web Worker without changing the document model.
The first language version intentionally excludes assignments, conditionals,
piecewise notation, custom functions and arbitrary JavaScript. New syntax will
require a versioned language decision and compatibility tests.
