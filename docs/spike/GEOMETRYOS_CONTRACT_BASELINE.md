# GeometryOS contract baseline

- Status: verified, including Layout Document 0.1
- Date: 2026-07-26
- GeometryOS repository commit:
  `fe5ece9f7138044d638114907fe9aaecfd14e924`

## Pinned contracts

| Contract | Version | Evidence |
|---|---|---|
| GeometryOS service | `0.2.0` | release manifest and OpenAPI metadata |
| HTTP API | `v1` / `1.0.0` | `schemas/openapi.v1.json` |
| GIR | `0.2.0` | GIR schema and generated response fixtures |
| Layout Document | `0.1.0` | OpenAPI schemas and executable layout fixtures |
| Consumer fixtures | `tutorboard/v1` | executable fixture manifest |

Pinned artifact hashes:

```text
OpenAPI v1
eda2e6a4ab1e6e96b0c3561574695637a0be060ff68ba6a0e7b5432e989d94e9

GIR 0.2 JSON Schema
dae399fa8a23458802760807c64f7b412d46ba81bb62b248cea136d714987993

TutorBoard v1 fixture manifest
23c1cdd94a5cf9212c538bbc6ff423d1eb8580aebba092f9c7647ad74d3c0538
```

These hashes are the immutable Gate 0/PR 2.8.1 evidence. Normal CI never downloads a mutable GeometryOS branch: generation uses the committed artifacts, while the live gate checks out the exact source commit.

## Verified behavior

- OpenAPI and GIR schema exports match their committed artifacts.
- TypeScript DTOs generate from OpenAPI and compile in strict mode.
- `POST /api/v1/generate` is a discriminated union: `success`, `needs_clarification`, or domain `error`.
- `POST /api/v1/layout` accepts canonical GIR and returns `success`, `unsupported`, or `invalid_scene`.
- Successful layout emits Layout Document `0.1.0` with structured GIR provenance.
- Expected domain outcomes remain HTTP 200 and are not Problem Details.
- Request validation and infrastructure failures use `application/problem+json`.
- OpenAPI formally publishes request and response `X-Request-ID` contracts.
- Generate publishes typed `503` service-unavailable Problem Details.
- Browser CORS is default-deny, accepts only the pinned exact origin, rejects an untrusted origin, does not permit credentials, and exposes `X-Request-ID`.
- Live response payloads pass the committed generated runtime validator.
- `/health` and `/ready` have distinct liveness and readiness semantics.
- Canonical responses emit GIR `0.2.0`; supported GIR `0.1` is read-only compatibility input.

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

## Layout compatibility resolution

`GenerateSuccessResponse` remains semantic and publishes canonical GIR plus optional renderings. Coordinate placement is a separate `POST /api/v1/layout` operation whose success response contains canonical GIR and machine-readable Layout Document `0.1.0`.

TutorBoard validates both response envelopes at runtime, uses GIR as the semantic source and uses Layout only for positions and visual segment style. SVG is not parsed and no fallback coordinates are retained.

## Executed checks

Producer artifact preparation:

```text
pinned OpenAPI/GIR/fixture SHA-256 verification
byte-identical DTO/runtime-validator regeneration
```

TutorBoard gates:

```text
npm run geometryos:check
npm run format:check
npm run lint
npm run typecheck
npm run test
npm run architecture
npm run build
npm run geometryos:live-smoke
```

The live smoke builds GeometryOS from the exact pinned commit in a hardened container and verifies CORS preflight, denied-origin behavior, browser-visible request correlation and generated response validation.

## Gate decision

Gate 0, the generated client boundary and the producer Layout contract are complete. TutorBoard can perform deterministic Layout-to-Board import without a fixture-only compatibility fallback.
