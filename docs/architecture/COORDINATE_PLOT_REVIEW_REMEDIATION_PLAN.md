# Coordinate plot review remediation plan

## Goal

Close the runtime, domain-consistency, fit, cache, numeric-input and accessibility findings identified after UX PR 3 while preserving BoardDocument 1.1, the expression language and semantic update-command contracts.

## Workstreams

### 1. Bound work before execution

- Add a coordinate-plane evaluation ceiling in addition to the existing point ceiling.
- Derive per-series point and evaluation limits from the remaining plane budget before sampling starts.
- Skip later visible series with an explicit truncated result once either budget is exhausted.
- Count cache hits as zero evaluation work for the current render.
- Keep cancellation support available for callers and retain the existing per-series limits.

### 2. Unify parameter-name validation

- Make the board domain the public source of truth for syntax, reserved names and duplicates.
- Reuse the same validator in the expression compiler and editor model.
- Prevent automatic names from producing x, t, e or function names.
- Keep reserved-name failures structural so invalid environments cannot be persisted.

### 3. Make fit domain-aware and bounded

- Evaluate finite explicit-domain expressions against current parameter bindings.
- Sample bounded explicit functions over those domains even when they are outside the current viewport.
- Preserve the current range for unbounded definitions.
- Cap expansion to a documented factor to contain extreme finite values and asymptotic outliers.

### 4. Preserve unaffected cache entries

- Compile a series before deriving its cache key.
- Include only parameter bindings referenced by the compiled formula, domain or range.
- Retain viewport, pixel size, zoom, options, geometry and sampler version in the key.

### 5. Stabilize editor and canvas interaction

- Keep numeric values as local text while the user enters signs, decimals or exponent prefixes.
- Commit finite numbers on blur or Enter and restore the last committed value after invalid input.
- Add complete arrow, Home and End navigation to the zoom-axis radiogroup.
- Clear the Konva container cursor whenever internal plot editing ends.

## Verification matrix

- Domain and compiler tests for reserved, duplicate and underscore-prefixed names.
- Editor-model tests for more than one alphabet cycle of generated parameter names.
- Sampler tests for pre-execution evaluation limits and unused-binding cache hits.
- Fit tests for explicit domains outside the visible X range.
- React tests for numeric draft preservation and radiogroup keyboard navigation.
- Existing quality, unit, integration, performance, browser and production-image gates remain required.
