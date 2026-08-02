# ADR-024 — Handwritten function interpretation boundary

## Status

Accepted for handwritten-function PR 2.

## Context

PR 1 established a provider-neutral multi-stroke session and recognition result.
Providers may return native TutorBoard text, LaTeX or JIIX. Those representations
cannot flow directly into a coordinate plot: provider syntax varies, malformed
input must stay bounded, unknown identifiers may represent parameters and only
the production expression compiler defines executable TutorBoard semantics.

Placing conversion in UI composition would duplicate validation and couple React
state to provider details. Extending the expression engine with LaTeX or JIIX
would give a core numerical boundary responsibility for external interchange
formats.

## Decision

- Keep interpretation in `modules/handwritten-function`.
- Depend on core exclusively through `../../core/public`.
- Introduce a versioned immutable interpretation result.
- Support a deliberately constrained school-mathematics LaTeX subset.
- Decode JIIX through bounded JSON traversal and discard provider DTO structure.
- Reject unsupported relations, systems, subscripts and unknown commands.
- Discover parameter candidates from exact `expression.unknown-identifier`
  compiler spans.
- Validate parameter names through `validatePlotParameterName`.
- Require a successful second production compile with discovered parameters.
- Rank candidates deterministically by confidence, format, parameter count and
  provider order.
- Treat close distinct candidates as ambiguous.
- Prevent an upstream `unrecognized` result from becoming automatically accepted.
- Preserve structured provider, conversion and compiler diagnostics.
- Keep interpretation synchronous and free from board mutation, UI, network,
  storage, clocks and generated identity.

## Consequences

PR 3 can consume one stable value containing a validated expression and ordered
parameter names. It can construct sliders and a coordinate plot without knowing
whether the provider returned LaTeX, JIIX or native text.

The converter intentionally covers a bounded notation subset. Unsupported input
stays editable as source ink and receives an explicit diagnostic. Expanding the
subset requires tests and a versioned compatibility decision.

The TutorBoard compiler remains the semantic authority. Conversion success alone
does not make a candidate executable.
