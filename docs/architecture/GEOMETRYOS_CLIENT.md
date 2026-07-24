# GeometryOS generated client boundary

## Decision

TutorBoard pins the GeometryOS OpenAPI, GIR schema and consumer fixture manifest
by source commit and SHA-256. Compile-time DTOs and standalone runtime validators
are generated from that same OpenAPI artifact. External DTOs remain private to
`adapters/geometryos-http`; the rest of TutorBoard consumes the platform-neutral
`GeometryOsClient` port from `core`.

## Flow

```text
prompt
  -> GeometryOsClient task
  -> one bounded HTTP request
  -> request-ID/content-type/body checks
  -> generated runtime validation
  -> normalized result union
```

The result union keeps HTTP 200 domain outcomes distinct from Problem Details,
transport failures, cancellation and incompatible contracts. The adapter marks
retryability but performs no retry. Application-level retry and import
deduplication require a durable import operation identity and belong to the
later geometry-import flow.

## Compatibility

Pinned versions:

- GeometryOS service `0.2.0`;
- HTTP API `v1` / `1.0.0`;
- GIR `0.2.0`;
- consumer fixtures `tutorboard/v1`.

A success response with another GIR version, invalid response schema, missing or
mismatched request ID, invalid content type, malformed UTF-8/JSON, or an
oversized body is rejected before any GIR-to-Board code can observe it.

## Privacy and security

The adapter never logs prompts, response bodies or credential-bearing URLs.
Base URLs cannot include credentials, query strings or fragments. Response
bodies are streamed through a byte limit before decoding. Generated validators
are compiled at build time; the browser does not dynamically compile schemas.

## Known producer follow-up

The pinned OpenAPI does not yet formally describe `X-Request-ID` response headers
or the generate endpoint's `503` response. Browser integration also requires
GeometryOS CORS to expose `X-Request-ID`. PR 2.8 enforces the protocol against
mocked responses; a live browser gate is required before the PR 2.9 vertical
slice is declared complete.
