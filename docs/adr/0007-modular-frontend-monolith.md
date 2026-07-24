# ADR-007: Modular frontend monolith

- Status: accepted
- Date: 2026-07-24
- Owners: TutorBoard maintainers

## Context

TutorBoard must evolve from a single-user canvas spike into a platform-connected
classroom without coupling the document model to React, a canvas library,
storage or GeometryOS DTOs. Runtime-loaded third-party plugins and
micro-frontends would add a compatibility and deployment surface before there
is a demonstrated consumer.

## Decision

TutorBoard is a statically composed modular frontend monolith with five
boundaries:

- `app` owns bootstrap and composition;
- `core` owns stable domain contracts;
- `modules` own user capabilities and expose only `public.ts`;
- `adapters` implement external technologies behind core-owned ports;
- `shared` contains stable platform-neutral utilities with multiple consumers.

Dependencies point toward `core`; dynamic plugin loading is outside the 1.0
scope. Feature directories are created only with their first real behavior.

## Alternatives considered

### Layered application without feature modules

- Advantages: less structure during the first spike.
- Disadvantages: feature ownership and public contracts become implicit.
- Rejection reason: later canvas, import, persistence and collaboration work
  would share mutable internals without enforceable boundaries.

### Runtime plugin system

- Advantages: third-party modules could be loaded independently.
- Disadvantages: requires an ABI, sandbox, version negotiation and security
  policy.
- Rejection reason: no approved runtime plugin consumer exists.

## Consequences

### Positive

- domain and external technologies can evolve independently;
- dependency violations can be rejected before review;
- later modules receive an explicit extension path.

### Negative and risks

- contributors must maintain public contracts deliberately;
- overly broad `shared` code could still erode ownership without review.

## Verification

`npm run architecture` enforces `ARCH-001`, `ARCH-002` and `ARCH-004`.
Synthetic regression cases live in
`tests/architecture/architecture-rules.test.mjs`.

## Revisit or rollback conditions

Revisit only when a concrete deployment or third-party extension use case
cannot be satisfied by static composition. Any replacement must preserve
BoardDocument ownership and provide an enforceable compatibility boundary.
