# ADR-011 — Server board synchronization

## Status

Accepted for the Phase 4 server-sync increment.

## Context

TutorBoard already has deterministic `BoardDocument 1.0` reducers and durable
local document revisions. The platform backend now owns lesson-scoped boards,
monotonic server revisions, idempotent command batches, snapshots, session
authentication, CSRF and ACL.

Sending whole documents after every edit would bypass the shared `board/v1`
command contract and make concurrent changes impossible to rebase safely.
Keeping pending commands only in memory would lose edits when the browser
reloads or the network fails after an uncertain request outcome.

## Decision

- `BoardSyncRepository` is the frontend port for server context, bootstrap,
  pull, push and revision-zero snapshots.
- `board-http` is its only production network adapter. It uses the same-origin
  `/api/v1` gateway, session credentials and the CSRF token issued by the
  backend.
- `sync-dexie` durably stores a confirmed server head and an ordered queue of
  local commands before network delivery.
- The cached head includes only the actor ID, organization ID and role needed
  to render an offline session. The CSRF token and session cookie are never
  persisted by TutorBoard.
- Each local command receives one stable idempotency key. Transport retries
  reuse the exact key. A `409` proves that the submitted base revision was not
  accepted, so the command may be deterministically rebased and retried with
  that same key.
- Recovery starts from the latest verified snapshot and applies contiguous
  server batches. Every resulting document SHA-256 is checked.
- Offline bootstrap uses the last confirmed cached head plus the durable
  pending queue. The `online` event re-runs server bootstrap when no session
  context exists, or performs pull/push when it does.
- Cross-origin board API URLs are rejected. Production traffic is expected to
  pass through the Tutor Assistant gateway.
- Parent sessions render the board read-only.

## Conflict policy

Remote batches are applied first in server-revision order. Pending local
commands are then replayed in durable sequence order. Each queued command keeps
its Lamport value and base revision observed at creation. Wall-clock timestamps
serve audit and presentation; reducer conflicts stop automatic rebase and open
the recovery UI. The local document and pending commands remain
available for export.

## History limitation

The existing local undo/redo stack changes documents without emitting a
`board/v1` command. It is therefore disabled only in server-sync mode until the
shared contract defines a deterministic synchronized undo operation or
compensating-command policy. Local development mode retains the complete
history workflow.

## Consequences

- Offline edits survive reloads and reconnect without silent last-write-wins.
- Unknown request outcomes are safe because idempotency identity is durable.
- Corrupt snapshots, revision gaps, checksum mismatches and non-replayable
  conflicts fail closed into recovery UI.
- Collaboration can later reuse the same command/revision machinery instead of
  replacing persistence again.
