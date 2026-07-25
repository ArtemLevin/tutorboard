# GeometryOS contract baseline

- Status: verified with one documented layout compatibility gap
- Date: 2026-07-25
- GeometryOS repository commit:
  `49e98394d0c9cdeaf7fdaf45b712dbee3a04a74c`

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
4507f5c2da15e70a5836198e4d9af709f382f6f73e766b10e7a78e7a1d12e549

GIR 0.2 JSON Schema
dae399fa8a23458802760807c64f7b412d46ba81bb62b248cea136d714987993

TutorBoard v1 fixture manifest
8777c49f8abbc7fec7e667b3fb475a781ed2c05523ce1e32e85387ea3b50782c
```

These hashes are the immutable Gate 0/PR 2.8.1 evidence. Normal CI never downloads a mutable GeometryOS branch: generation uses the committed artifacts, while the live gate checks out the exact source commit.

## Verified behavior

- OpenAPI and GIR schema exports match their committed artifacts.
- TypeScript DTOs generate from OpenAPI and compile in strict mode.
- `POST /api/v1/generate` is a discriminated union: `success`, `needs_clarification`, or domain `error`.
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

## Layout compatibility gap

`GenerateSuccessResponse` publishes canonical GIR and optional SVG/TikZ, but no machine-readable layout object. The success fixture therefore cannot provide canonical point coordinates to a GIR-to-Board adapter.

This does not block repository foundation or the pure semantic portion of PR 2.9. It affects coordinate placement:

1. SVG must not become the semantic source (`GEO-009`).
2. The spike may use a deterministic, versioned fallback layout only for the approved triangle-and-altitude fixture until GeometryOS publishes Layout Document 0.1.
3. Fallback coordinates belong to the adapter result, never to canonical GIR.
4. The Phase 2 report must retain the bounded fallback as explicit debt or consume the versioned GeometryOS layout contract.

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

Gate 0 and PR 2.8.1 are complete. TutorBoard may proceed to deterministic GIR-to-Board import while treating machine-readable layout as the only remaining producer compatibility gap.
