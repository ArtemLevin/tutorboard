# GeometryOS HTTP adapter

This adapter is the only TutorBoard runtime owner of the GeometryOS transport
contract. It consumes a platform-neutral `GeometryOsClient` port from `core`,
uses DTOs and standalone validators generated from the pinned OpenAPI artifact,
and returns a normalized result union.

The adapter deliberately does not import the board store, create geometry
objects, retry requests, parse SVG for semantics, or persist imports. Those
responsibilities belong to the application flow and the later GIR-to-Board
adapter.

## Boundary guarantees

- one `POST /api/v1/generate` per task;
- caller-visible cancellation and a separate client timeout result;
- bounded response streaming before UTF-8 and JSON parsing;
- `X-Request-ID` correlation and mismatch rejection;
- distinct success, clarification, domain error, Problem Details, transport and
  incompatible-contract results;
- generated DTOs never escape this adapter;
- prompts and raw responses are never logged by the adapter.
