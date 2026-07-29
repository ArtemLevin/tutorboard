# ADR-013: Server-ordered command-log collaboration

- Status: accepted
- Date: 2026-07-28

## Decision

The existing optimistic, idempotent command log remains the sole durable
collaboration order. A tenant/document-scoped WebSocket distributes revision
notifications and ephemeral presence. Clients pull accepted batches, rebase
their durable local queue, and retry with unchanged idempotency keys.

## Consequences

CRDT state and operation bodies are not duplicated over WebSocket. A lost
socket message affects latency, not correctness. Presence never enters
`BoardDocument`. Undo emits exact inverse commands for the local actor; an
operation without an exact inverse in `board/v1` is not silently undone.
Geometry import remains one atomic command.
