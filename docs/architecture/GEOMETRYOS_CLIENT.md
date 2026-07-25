# GeometryOS generated client boundary

## Decision

TutorBoard pins the GeometryOS OpenAPI, GIR schema and consumer fixture manifest by source commit and SHA-256. Compile-time DTOs and standalone runtime validators are generated from that same OpenAPI artifact. External DTOs remain private to `adapters/geometryos-http`; the rest of TutorBoard consumes the platform-neutral `GeometryOsClient` port from `core`.

Ajv standalone output is normalized at the generator boundary into executable ESM. Only explicitly supported runtime helpers may be bridged; unknown CommonJS markers fail generation. Root and isolated code-generation toolchains must pin the same exact Ajv version.

## Flow

```text
prompt
  -> GeometryOsClient task
  -> one bounded HTTP request
  -> request-ID/content-type/body checks
  -> generated runtime validation
  -> normalized result union
```

The result union keeps HTTP 200 domain outcomes distinct from Problem Details, transport failures, cancellation and incompatible contracts. The adapter marks retryability but performs no retry. Application-level retry and import deduplication require a durable import operation identity and belong to the later geometry-import flow.

## Compatibility

Pinned producer:

- repository `ArtemLevin/geometryos`;
- commit `49e98394d0c9cdeaf7fdaf45b712dbee3a04a74c`;
- GeometryOS service `0.2.0`;
- HTTP API `v1` / `1.0.0`;
- GIR `0.2.0`;
- consumer fixtures `tutorboard/v1`.

A success response with another GIR version, invalid response schema, missing or mismatched request ID, invalid content type, malformed UTF-8/JSON, or an oversized body is rejected before any GIR-to-Board code can observe it.

The committed OpenAPI declares request and response `X-Request-ID` contracts and typed generate `503` Problem Details. CI imports and executes the raw generated validator with the plain Node ESM loader, then builds the exact producer commit and proves allowed/denied CORS preflight. A separate Chromium probe performs one request with an explicit 30-second abort budget, reads the exposed request correlation header and validates the live response with the same generated validator.

## Privacy and security

The adapter and live probes never log prompts, response bodies or credential-bearing URLs. Base URLs cannot include credentials, query strings or fragments. Response bodies are streamed through a byte limit before decoding. Generated validators are compiled at build time; the browser does not dynamically compile schemas. Playwright traces are disabled for the live probe, and its diagnostics contain only safe codes, status, schema paths and correlation metadata. The CI container receives only a non-secret exact development origin.

## Remaining producer follow-up

GeometryOS still does not publish a versioned machine-readable layout contract. GIR remains the mathematical source; SVG must not be parsed for semantics or coordinates. PR 2.9 may implement its pure semantic mapping independently, while general placement should consume Layout Document 0.1 or retain an explicitly bounded fixture-only fallback.
