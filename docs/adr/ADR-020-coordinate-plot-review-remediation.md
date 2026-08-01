# ADR-020: Coordinate plot runtime and editor remediation

- Status: Accepted
- Date: 2026-08-01
- Scope: expression parameter environments, sampling orchestration, fit, cache and editor interaction

## Decision

1. Plane-level point and evaluation budgets are applied before each series starts.
2. Cached samples consume output-point capacity while contributing zero evaluation work to the current render.
3. Parameter names use one domain validator covering syntax, reserved language names and duplicates.
4. Series cache keys contain only bindings referenced by compiled expressions.
5. Fit evaluates explicit domain bounds, samples over the resolved finite range and limits viewport expansion to one hundred times the reference span.
6. Numeric editor controls retain textual drafts and commit finite values on blur or Enter.
7. The zoom-axis radiogroup implements keyboard navigation, and renderer cursor state is cleared when editing ends.

## Consequences

- Worst-case synchronous sampling work is bounded independently of the number of valid series.
- Changing an unrelated parameter preserves reusable series samples.
- Generated and manually entered parameter names follow the same expression-language contract.
- Fit can discover bounded functions outside the current viewport while extreme values remain contained.
- Intermediate numeric input remains stable and keyboard interaction follows radiogroup semantics.
- BoardDocument remains version 1.1 and no persisted field is added.
