# Atomic large-clear Undo — bounded delivery (2026-10-20)

## Context
The original undo of a local `core.clipboard.cut` produces one
`core.clipboard.paste`. The command codec limits the paste to **5,000
snapshots per list** and **2 MiB per JSON command**. A 10,000-stroke clear is
valid as a cut but its inverse can exceed these boundaries.

The current Board API accepts **up to 100 ordered commands per envelope**, with
a default **5 MiB body limit** (`board_command_max_size_mb`). The server
persists each valid envelope under one idempotency key and one revision in a
single database transaction.

## Implemented contract
- Locally generated, fully self-contained restore inverses may be partitioned
  along complete group / GeometryOS import / 3D solid boundaries, preserving the
  original restored order. A component that spans several distant objects must
  remain indivisible.
- Each `core.clipboard.paste` is separately schema-valid (<=5,000 objects,
  <=2 MiB); the planned envelope has <=100 commands and a conservative 4 MiB
  upper budget inclusive of per-command envelope allowances.
- The entire array goes through the existing `applyWithReceipt` ->
  `enqueueBatch` -> `pendingBatchPrefix` -> server revision transaction.
  One durable `batchId` survives offline persistence, 409 rebase and
  duplicate acknowledgement. Replay quarantines a failed group together;
  the server never sees partly committed restored content from this group.
- A single collision certificate covers every restored object, group, import
  and solid ID. Actual authorization, reducer validation and SHA remain in
  the sync engine and server contract.
- Small clears preserve their original single-command behavior.
- An inverse that cannot be encoded atomically is an **Undo barrier** with an
  explicit user notice. It must never use sequential independent revision
  writes or expose an older unrelated action as undoing the clear.

## Known blockers to arbitrary-size Undo
This scoped implementation **does not complete arbitrary-size restoration**:
- An indivisible group/import/solid component can exceed 5,000 objects or
  2 MiB, which cannot be represented by the current paste codec.
- A whole restore above the 5 MiB default API body limit cannot be one
  envelope. Non-default deployments may enforce an even smaller body limit.
- `core.clipboard.paste` restoration still does not recover deleted
  3D learning attempts (preexisting limitation).

To fully resolve these cases, design and deploy a **backend-owned multipart
staging + atomic finalize protocol**, with bounded authenticated upload,
digest/content ownership, access epoch verification at finalize, idempotent
retry/reconnect, cleanup of abandoned staging data, and a single published
revision/consistent snapshot at commit. The protocol must also support
indivisible graph components with a staged document validator rather than
exposing intermediate invalid documents. Extend frontend durable transport,
server storage and contract migration only after end-to-end tests for conflicts,
revocation, crashes and restore of 10,000 complex strokes.

## Release status
PR #274 is **Draft** pending exact-head quality, browser and full-stack CI
review. No production rollout or arbitrary-size Undo completion is claimed.
