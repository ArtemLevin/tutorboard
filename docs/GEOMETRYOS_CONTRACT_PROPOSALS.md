# GeometryOS contract proposals after Phase 2

Phase 2 can ship against API `1.0.0`, GIR `0.2.0` and Layout Document `0.1.0`.
The following proposals are follow-up work, not hidden requirements for the
completed spike.

## Required before production integration

### G-13 release bundle

Publish GeometryOS `0.3.0` with:

- Layout schema and positive/negative fixtures in the release bundle;
- `POST /api/v1/layout` in the public upgrade guide;
- exact compatibility notes for GIR `0.2.0` and Layout `0.1.0`;
- reproducible container/release provenance.

TutorBoard should repin by exact commit/release and regenerate types and
standalone validators before adopting it.

### Platform gateway boundary

Production TutorBoard should reach GeometryOS through the approved
`tutor-assistant-web` gateway. The gateway contract must preserve:

- `X-Request-ID` correlation;
- Problem Details status/body;
- bounded timeouts and cancellation;
- tenant/lesson authorization;
- response-size limits;
- no browser credentials sent directly to GeometryOS.

Direct-browser CORS remains development/live-contract evidence, not a production
topology decision.

## Required before semantic point editing

Define a versioned semantic edit/recompute operation. It must state:

- edit target identity and expected GIR version/hash;
- whether a point is free or constrained;
- recomputation and validation result;
- typed conflict/unsupported/invalid outcomes;
- replacement canonical GIR and Layout;
- mapping continuity or explicit remap;
- request correlation and idempotency.

TutorBoard must not enable independent or constrained point drag merely through
a frontend feature flag.

## Layout coverage extensions

Layout `0.1.0` intentionally covers points, segments and labels. Future versioned
extensions may add:

- lines and rays with clipped display extents;
- circles/arcs;
- angle and equality marks;
- polygon fills;
- axes and coordinate annotations.

Each visual element needs stable synthetic identity, structured source
provenance, bounds contribution and deterministic z-order. TutorBoard will not
infer these entities from SVG.

## Stable visual provenance

Keep `source.role`, source object ID and optional source index sufficient to
distinguish explicit GIR entities from derived visuals. Any new role must be
versioned and covered by fixtures. Duplicate visuals representing the same
semantic entity must have a deterministic consumer deduplication rule.

## Deferred, not proposed

- GeometryOS storing `BoardDocument`, viewport or user visual overrides;
- GeometryOS accepting arbitrary TutorBoard commands;
- SVG as a semantic interchange contract;
- CRDT/collaboration semantics inside GeometryOS.
