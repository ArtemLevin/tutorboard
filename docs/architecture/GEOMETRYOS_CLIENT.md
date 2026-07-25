# GeometryOS generated client boundary

## Decision

TutorBoard pins the GeometryOS OpenAPI, GIR schema and consumer fixture manifest by source commit and SHA-256. Compile-time DTOs and standalone runtime validators are generated from that same OpenAPI artifact. External DTOs remain private to `adapters/geometryos-http`; the rest of TutorBoard consumes the platform-neutral `GeometryOsClient` port from `core`.

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

The committed OpenAPI now declares request and response `X-Request-ID` contracts and typed generate `503` Problem Details. CI additionally builds the exact producer commit and proves allowed/denied CORS preflight, non-credentialed browser access, exposed request correlation and runtime response validation.

## Privacy and security

The adapter and live smoke never log prompts, response bodies or credential-bearing URLs. Base URLs cannot include credentials, query strings or fragments. Response bodies are streamed through a byte limit before decoding. Generated validators are compiled at build time; the browser does not dynamically compile schemas. The CI container receives only a non-secret exact development origin.

## Remaining producer follow-up

GeometryOS still does not publish a versioned machine-readable layout contract. GIR remains the mathematical source; SVG must not be parsed for semantics or coordinates. PR 2.9 may implement its pure semantic mapping independently, while general placement should consume Layout Document 0.1 or retain an explicitly bounded fixture-only fallback.
