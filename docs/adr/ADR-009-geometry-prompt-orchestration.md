# ADR-009: Geometry prompt orchestration

- Status: accepted
- Date: 2026-07-26

## Context

The HTTP client and atomic import adapter are independently complete, but the user-visible spike requires a cancellable sequence across readiness, generation, layout, document mutation and persistence. React must not observe external DTOs, create partial geometry, retry inside the transport adapter or confuse expected GeometryOS domain outcomes with infrastructure failures.

## Decision

`modules/geometry-prompt` owns one platform-neutral `startGeometryPrompt` operation:

```text
readiness → generate → layout → prepare import command
```

Each network step is a separate `GeometryOsClient` task with its own request ID and cancellation. The operation publishes safe progress metadata, never logs prompt or payload content and stops immediately for:

- service not ready;
- clarification;
- supported-domain error;
- Problem Details or transport failure;
- incompatible response contract;
- unsupported or invalid layout;
- GIR/Layout mapping failure.

Only a complete Layout success reaches `createGeometryImportCommand`. The operation derives the import and command identities inside the module from an injected opaque token, computes one translation that centers Layout bounds on the current viewport world center and returns one command without mutating a document.

The application composition root owns the HTTP adapter and passes its core port to the persisted workspace. React owns only presentation state and dispatch: it applies the returned command once, automatically selects its Board object IDs and lets the existing document-change/autosave boundary persist the result.

## UI state

The prompt panel distinguishes idle, readiness, generation, layout, import, clarification, domain error, retryable failure and success. Diagnostics show codes, stage and request ID without logging or displaying raw responses. Retry starts a new bounded operation; an import identity is created only after a successful layout, so a failed attempt cannot leave a duplicate Board import.

The development build uses public `VITE_GEOMETRYOS_BASE_URL`. Credentials, query strings and fragments are rejected. This does not decide the later production gateway route.

## Persistence evidence

The browser vertical-slice test supplies contract fixtures at the network boundary, submits the required triangle-altitude prompt, observes one 12-object selected import, waits for autosave, reloads the page and compares the persisted visual translation before and after reload.

## Consequences

- readiness is now part of the generated/validated client boundary;
- request correlation survives the complete application flow;
- clarification and domain failure never create Board state;
- the app cannot render a partial geometry construction;
- PR 2.11 remains the owner of imported-group movement and visual override semantics;
- a live production GeometryOS route is still deferred to the platform gateway decision.
