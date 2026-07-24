# GeometryOS contract baseline

- Status: verified with one documented compatibility gap
- Date: 2026-07-24
- GeometryOS repository commit:
  `a9eb95852328a4665f81d16cee30966cb227676c`

## Pinned contracts

| Contract | Version | Evidence |
|---|---|---|
| GeometryOS service | `0.2.0` | release manifest and OpenAPI metadata |
| HTTP API | `v1` / `1.0.0` | `schemas/openapi.v1.json` |
| GIR | `0.2.0` | GIR schema and generated response fixtures |
| Consumer fixtures | `tutorboard/v1` | executable fixture manifest |

Pinned artifact hashes:

```text
OpenAPI v1
70815f28ee32e300744c7ac841a0b63b4c1153cccefa066507049ccd19034ea2

GIR 0.2 JSON Schema
dae399fa8a23458802760807c64f7b412d46ba81bb62b248cea136d714987993

TutorBoard v1 fixture manifest
3694c788e4e94d1c636510ec3ce73f70cebd63a0c42743e94f19ab6d29af12a3
```

These hashes are evidence for Gate 0. PR 2.8 must consume an immutable
GeometryOS release artifact and verify the selected hash before generated DTOs
are accepted.

## Verified behavior

- OpenAPI and GIR schema exports match their committed artifacts.
- TypeScript DTOs generate from OpenAPI and compile in strict mode.
- `POST /api/v1/generate` is a discriminated union:
  `success`, `needs_clarification`, or domain `error`.
- Expected domain outcomes remain HTTP 200 and are not Problem Details.
- Request validation and infrastructure failures use
  `application/problem+json`.
- every response receives `X-Request-ID`; Problem Details also carries
  `request_id`;
- `/health` and `/ready` have distinct liveness and readiness semantics;
- canonical responses emit GIR `0.2.0`; supported GIR `0.1` is read-only
  compatibility input.

## Error matrix

| Outcome | Transport | TutorBoard policy |
|---|---|---|
| success | HTTP 200 JSON | validate version and response before import |
| needs clarification | HTTP 200 JSON | show options; do not retry unchanged input |
| domain error | HTTP 200 JSON | show supported-domain diagnostic |
| invalid request | HTTP 422 Problem Details | correct request; no automatic retry |
| unavailable | HTTP 503 or network failure | retryable with bounded backoff |
| operation timeout | HTTP 504 Problem Details | retryable because generation is side-effect-free |
| internal error | HTTP 500 Problem Details | diagnostic with request ID |
| incompatible API/GIR | client boundary rejection | preserve payload for diagnosis; do not import |

## Layout compatibility gap

`GenerateSuccessResponse` publishes canonical GIR and optional SVG/TikZ, but no
machine-readable layout object. The success fixture therefore cannot provide
canonical point coordinates to a GIR-to-Board adapter.

This does not block repository foundation or BoardDocument work. It does affect
PR 2.9:

1. SVG must not become the semantic source (`GEO-009`).
2. The spike may use a deterministic, versioned fallback layout only for the
   approved triangle-and-altitude fixture.
3. Fallback coordinates belong to the adapter result, never to canonical GIR.
4. The Phase 2 report must propose a GeometryOS layout contract or explicitly
   retain the bounded fallback.

## Executed checks

From the GeometryOS repository at the pinned commit:

```text
uv run python scripts/export_openapi.py --check
uv run python scripts/export_schema.py --check
uv run pytest tests/contracts
npm ci --prefix contracts/tutorboard/typescript
npm run --prefix contracts/tutorboard/typescript generate
npm run --prefix contracts/tutorboard/typescript typecheck
```

Result: artifact checks passed, 22 contract tests passed, generated TypeScript
compiled successfully.

## Gate decision

Gate 0 is complete. TutorBoard may proceed to repository foundation while
treating layout availability as an explicit, testable compatibility gap.
