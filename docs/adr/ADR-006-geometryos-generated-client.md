# ADR-006: Generated GeometryOS client boundary

- Status: accepted
- Date: 2026-07-24
- Updated: 2026-07-25

## Context

TutorBoard must consume a large OpenAPI 3.1 contract containing canonical GIR. Static TypeScript types alone do not validate untrusted network responses, while handwritten runtime schemas would create a second contract likely to drift.

## Decision

Vendor immutable GeometryOS artifacts, generate TypeScript DTOs with the same pinned `openapi-typescript` version used by the producer contract smoke, and generate Ajv 2020 standalone validators from the same OpenAPI document. Keep all generated DTOs private to `adapters/geometryos-http` and expose only a normalized `GeometryOsClient` port from `core`.

The adapter performs no automatic retry and does not create Board objects. Contract repins require exact source commit and SHA-256 provenance, a reproducible generated diff and a live browser-contract gate against a container built from that same commit.

## Consequences

- contract upgrades produce an explicit artifact and generated-code diff;
- network responses are validated at runtime before entering TutorBoard;
- generated validator output is committed and reproducibility-checked;
- OpenAPI request/response `X-Request-ID`, typed generate `503` and exact-origin CORS are verified against the real producer runtime;
- the production bundle may include small Ajv runtime helpers referenced by the standalone output;
- machine-readable layout remains the only producer follow-up before the general GIR-to-Board placement contract.

## Rejected alternatives

- handwritten DTOs or Zod copies: duplicate source of truth;
- using generated TypeScript types without runtime validation: unsafe boundary;
- compiling OpenAPI dynamically in the browser: unnecessary code generation and CSP complexity;
- returning generated DTOs from the core port: external contract leakage;
- parsing SVG to recover layout or semantics: violates the GIR-first boundary;
- testing only mocked transport: cannot prove real CORS middleware and exposed response headers.
