# GeometryOS generated client boundary

## Decision

TutorBoard pins the GeometryOS OpenAPI, GIR schema and consumer fixture manifest by source commit and SHA-256. Compile-time DTOs and standalone runtime validators are generated from that same OpenAPI artifact. External DTOs remain private to `adapters/geometryos-http`; the rest of TutorBoard consumes the platform-neutral `GeometryOsClient` port from `core`.

Ajv standalone output is normalized at the generator boundary into executable ESM. Only explicitly supported runtime helpers may be bridged; unknown CommonJS markers fail generation. Root and isolated code-generation toolchains must pin the same exact Ajv version.

## Flow

```text
prompt
  -> readiness request
  -> GeometryOsClient task
  -> one bounded generate or layout HTTP request
  -> request-ID/content-type/body checks
  -> generated runtime validation
  -> normalized result union
```

The result unions keep readiness, HTTP 200 domain outcomes, Problem Details, transport failures, cancellation and incompatible contracts distinct. The adapter marks retryability but performs no retry. Application-level retry and import identity belong to the `geometry-prompt` workflow.

## Compatibility

Pinned producer:

- repository `ArtemLevin/geometryos`;
- commit `fe5ece9f7138044d638114907fe9aaecfd14e924`;
- GeometryOS service `0.2.0`;
- HTTP API `v1` / `1.0.0`;
- GIR `0.2.0`;
- Layout Document `0.1.0`;
- consumer fixtures `tutorboard/v1`.

A success response with another GIR or Layout version, invalid response schema, missing or mismatched request ID, invalid content type, malformed UTF-8/JSON, or an oversized body is rejected before any GIR-to-Board code can observe it.

The committed OpenAPI declares request and response `X-Request-ID` contracts, typed readiness, Problem Details, generate outcomes and layout outcomes. CI imports and executes the raw generated validators with the plain Node ESM loader, then builds the exact producer commit and proves allowed/denied CORS preflight. A separate Chromium probe performs a request with an explicit 30-second abort budget, reads the exposed request correlation header and validates the live response with the same generated validator.

## Privacy and security

The adapter and live probes never log prompts, response bodies or credential-bearing URLs. Base URLs cannot include credentials, query strings or fragments. Response bodies are streamed through a byte limit before decoding. Generated validators are compiled at build time; the browser does not dynamically compile schemas. Playwright traces are disabled for the live probe, and its diagnostics contain only safe codes, status, schema paths and correlation metadata. The CI container receives only a non-secret exact development origin.

## Layout boundary

`startLayout` accepts only canonical GIR and returns normalized `success`, `unsupported` or `invalid-scene` domain outcomes plus the shared transport, Problem Details, cancellation and incompatible-contract failures. On success, the adapter exposes canonical GIR and Layout Document `0.1.0` through platform-neutral core types.

GIR remains the mathematical source and Layout remains the placement source. SVG is never parsed for semantics or coordinates. The HTTP adapter does not create Board objects; `modules/geometry-import` joins validated GIR semantics and Layout provenance after both transport boundaries have accepted the payload.
