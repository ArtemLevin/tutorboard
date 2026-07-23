---
name: geometryos-integration-review
description: >
  Protect TutorBoard's GeometryOS OpenAPI, GIR, HTTP client, runtime validation,
  error model, layout, deterministic GIR-to-Board mapping, provenance, retry,
  and import invariants. Use for any GeometryOS contract or geometry import
  change.
---

# Purpose

Keep mathematical semantics outside UI state while making imports reproducible,
diagnosable, and compatible.

# Required context

Read `../../../PLAN.md` sections 6.5 and 7.3, the pinned OpenAPI/GIR versions,
consumer fixtures, client boundary, adapter, and nearest contract tests.

# Workflow

1. Confirm generated DTO provenance and runtime validation.
2. Separate success, clarification, domain error, Problem Details, transport
   failure, timeout, and incompatible version.
3. Trace request ID and retry/deduplication behavior.
4. Verify that the adapter is pure and mapping deterministic.
5. Check missing, duplicate, unsupported, and layout-gap paths.
6. Ensure canonical GIR and provenance survive round-trip.
7. Reject SVG parsing as the primary semantic source.

# Required fixtures

Cover success, clarification, domain error, invalid response, incompatible
version, duplicate ID, missing reference, missing layout, unsupported entity,
repeated import, timeout, and unavailable service when relevant.

# Output

Return contract versions, invariant IDs, mapping policy, error matrix,
fixtures/checks, compatibility gaps, and required GeometryOS follow-up.

