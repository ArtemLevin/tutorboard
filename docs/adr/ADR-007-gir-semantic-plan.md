# ADR-007: Pure GIR semantic import plan

- Status: accepted
- Date: 2026-07-25

## Context

TutorBoard receives canonical GIR `0.2.0` as validated JSON from the GeometryOS client, but external transport DTOs cannot become the board, UI or persistence model. The next layout contract is not available yet, so coordinate placement and `BoardObject` creation must remain outside the semantic mapping step.

## Decision

`modules/geometry-import` owns a synchronous and deterministic `createGeometryImportSemanticPlan` function. The module validates canonical GIR again at its own trust boundary using a generated standalone validator derived from the pinned GIR schema. It then builds typed object, constraint and construction-step indexes, resolves references, derives stable future Board IDs and returns a `GeometryImportSemanticPlan`.

The plan contains semantic candidates, GIR-to-Board mapping, primary and represented provenance, normalized references and a deterministic root group ID. It contains no coordinates, styles, viewport state, `BoardObject`, `BoardGroup`, `GeometryImportRecord` or document command.

Expected contract failures return a discriminated failure result with sanitized diagnostics and no partial plan. The adapter never reads SVG and never guesses unsupported visual semantics.

## Identity policy

Future Board IDs are derived only from the import ID, GIR entity ID and a fixed semantic role. External components are UTF-8/base64url encoded. IDs are validated by the existing core branded constructors. Values that exceed the core identifier contract fail explicitly; they are never truncated. A collision registry provides a second fail-closed check.

## Mapping policy

- points create point candidates;
- explicit segments create segment candidates;
- triangle edges reuse exactly one matching explicit segment or create a deterministic synthetic edge;
- multiple explicit segments for one triangle edge are ambiguous and fail;
- explicit labels suppress generated point labels for the same target;
- line, ray, circle and angle references are validated but currently produce unsupported diagnostics rather than inferred Board objects;
- constraints and construction steps are reference-validated but do not become visual candidates.

`mapping` is keyed by GIR object ID. A Board candidate may represent more than one GIR object; primary provenance remains separate from the complete represented-ID set.

## Consequences

- PR 2.9A can proceed independently of Layout Document 0.1;
- the same GIR and import ID produce byte-equivalent semantic output;
- missing, duplicate, degenerate and wrong-kind references stop planning explicitly;
- PR 2.9B can consume the plan without repeating semantic resolution;
- coordinates, object schemas, renderers and atomic document mutation remain deferred to PR 2.9B;
- generated module-private types contain only `GirScene` and its transitively reachable schemas, extracted reproducibly from the pinned OpenAPI output.

## Rejected alternatives

- using GeometryOS DTOs directly as module/store models: leaks the external contract;
- importing private HTTP-adapter generated files: violates module direction;
- parsing SVG for identities or relations: violates GIR-first semantics;
- assigning IDs from array indexes, time or randomness: breaks deterministic replay;
- creating placeholder coordinates in PR 2.9A: duplicates the pending GeometryOS layout contract;
- returning a partial plan together with errors: creates an unsafe atomicity ambiguity.
