# ADR-006: Generated GeometryOS client boundary

- Status: accepted
- Date: 2026-07-24

## Context

TutorBoard must consume a large OpenAPI 3.1 contract containing canonical GIR.
Static TypeScript types alone do not validate untrusted network responses, while
handwritten runtime schemas would create a second contract likely to drift.

## Decision

Vendor immutable GeometryOS artifacts, generate TypeScript DTOs with the same
pinned `openapi-typescript` version used by the producer contract smoke, and
generate Ajv 2020 standalone validators from the same OpenAPI document. Keep all
generated DTOs private to `adapters/geometryos-http` and expose only a normalized
`GeometryOsClient` port from `core`.

The adapter performs no automatic retry and does not create Board objects.

## Consequences

- contract upgrades produce an explicit artifact and generated-code diff;
- network responses are validated at runtime before entering TutorBoard;
- generated validator output is committed and reproducibility-checked;
- the production bundle may include small Ajv runtime helpers referenced by the
  standalone output;
- request-ID/CORS and machine-readable layout remain explicit GeometryOS
  follow-ups before the full vertical import slice.

## Rejected alternatives

- handwritten DTOs or Zod copies: duplicate source of truth;
- using generated TypeScript types without runtime validation: unsafe boundary;
- compiling OpenAPI dynamically in the browser: unnecessary code generation and
  CSP complexity;
- returning generated DTOs from the core port: external contract leakage;
- parsing SVG to recover layout or semantics: violates the GIR-first boundary.
