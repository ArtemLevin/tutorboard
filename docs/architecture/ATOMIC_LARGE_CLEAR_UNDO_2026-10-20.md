# Atomic large-clear Undo — versioned complete-graph recovery

**Date:** 2026-10-20  
**Frontend:** [#274](https://github.com/ArtemLevin/tutorboard/pull/274)  
**Backend:** [#50](https://github.com/ArtemLevin/tutor-assistant-web/pull/50)  
**Tracker:** [#275](https://github.com/ArtemLevin/tutorboard/issues/275)  
**Status:** Draft. Release gate and coordinated rollout required.

## Data model / versioned protocol

Existing `core.clipboard.paste` retains the 5,000-object/list and 2 MiB JSON
command bounds. The new `core.clipboard.restore-graph` carries
`graphVersion: "1.0"`, up to **10,000 complete object snapshots** plus
their self-contained groups, GeometryOS imports and 3D model records, and
has a conservative **40 MiB JSON** limit.

The complete graph is validated and applied in one reducer transition. Neither
a partially populated group nor a dangling import reference can be published.
The reverse cut has a single certified collision set covering all restored
object/group/import/solid IDs, and the local sync engine checks and admits the
entire graph before durable transmission. Offline queues retain the operation;
conflicting peer changes reject it. The existing 100-command atomic batch
support continues to handle splittable graphs.

The transport uses the established authenticated multipart staging endpoint for
**every graph command**, regardless of byte size. The server refuses graph
commands on the legacy POST /commands path; it retains its default 5 MiB limit.
Staging has a 48 MiB request ceiling, 512 KiB parts, SHA-256 checks, one-hour
expiry, and tenant/board/actor/access-epoch ownership. The *trusted* backend
validates identifier safety, object-to-group membership, GeometryOS provenance,
and import/3D graph edges. Graph commands retain the current envelope
`schemaVersion: "1.7"`; their separately versioned graph payload is strictly
validated. Unknown versions and malformed references fail closed.

Finalization calls `BoardPersistenceService.append_commands()`, preserving
Lamport/revision checks, existing idempotency, media asset authority, one durable
revision, and one collaboration notification. Before finalize, the staged bytes
are invisible to other clients. Reconnect, stale revision and repeated finalize
use existing durable sync/rebase and idempotent server responses.

## Backward compatibility and deploy sequence

- Existing command/document/snapshot formats stay valid and are read unchanged.
- Historical and ordinary paste commands keep their original validation limits.
- An **older client cannot decode the new command kind**. Upgrade all active
  board clients to the pinned new frontend and deploy the matching backend
  models and migration before enabling graph Undo. Old clients must reload
  before participating. Never publish graph restores during mixed-version pilot
  sessions.
- Release manifest and vendored schema/DTOs are pinned to the exact matching
  frontend commit. Perform two-client collaboration, guest permission/revoke,
  reconnect, restart, backup/restore and staging migration gates before merge.

## Limitations and next checks

- This version supports a single indivisible component up to **10,000 object
  snapshots and 40 MiB**. Larger documents remain a safe Undo barrier pending
  a separately designed higher-capacity policy.
- Pre-existing inverse limitations around removed 3D learning attempts remain.
- Live dual-client performance for 10k mixed strokes and 10 images, physical
  device/GPU scenarios, and HTTPS production soak require dedicated checks.
- Do not close #275 or merge Draft PRs until the exact-head coordinated gate and
  explicit release decision are recorded.
