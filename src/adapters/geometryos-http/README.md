# GeometryOS HTTP adapter

This adapter is the only TutorBoard runtime owner of the GeometryOS transport
contract. It consumes a platform-neutral `GeometryOsClient` port from `core`,
uses DTOs and standalone validators generated from the pinned OpenAPI artifact,
and returns a normalized result union.

The adapter deliberately does not import the board store, create geometry
objects, retry requests, parse SVG for semantics, or persist imports. Those
responsibilities belong to the application flow and `modules/geometry-import`.

## Boundary guarantees

- one `POST /api/v1/generate` or `POST /api/v1/layout` per task;
- caller-visible cancellation and a separate client timeout result;
- bounded response streaming before UTF-8 and JSON parsing;
- `X-Request-ID` correlation and mismatch rejection;
- distinct generate and layout domain outcomes, Problem Details, transport and
  incompatible-contract results;
- explicit GIR `0.2.0` and Layout Document `0.1.0` compatibility gates;
- generated DTOs never escape this adapter;
- prompts and raw responses are never logged by the adapter.
