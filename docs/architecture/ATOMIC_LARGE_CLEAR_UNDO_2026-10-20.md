# Atomic large-clear Undo — coordinated multipart integration (2026-10-20)

## Source of truth

Existing BoardDocument commands and schema 1.7 retain their public contracts.
The legacy command codec limits each `core.clipboard.paste` to 5,000 objects
per array and 2 MiB of JSON. Server `POST /commands` retains its configured
5 MiB request limit by default.

## Implemented (two coordinated Draft PRs)

- Frontend: [TutorBoard #274](https://github.com/ArtemLevin/tutorboard/pull/274)
- Backend: [tutor-assistant-web #50](https://github.com/ArtemLevin/tutor-assistant-web/pull/50)
- Tracker: [Issue #275](https://github.com/ArtemLevin/tutorboard/issues/275)

Generated self-contained clear inverses are segmented at complete group/import/
3D-model dependency boundaries into individually valid `clipboard.paste`
commands. Object order is preserved. Each command retains the existing 2 MiB
and 5,000-record boundaries; at most 100 commands form one sync batch.
The local planner uses a conservative 40 MiB envelope budget. A single
ID-collision certificate covers all objects, groups, imports and solid IDs.

A batch fitting 4 MiB still uses the ordinary `POST /commands` endpoint.
For larger batches, frontend uploads the exact UTF-8 JSON to
`/api/v1/boards/{documentId}/command-uploads` in 512 KiB chunks.
SHA-256 of the envelope supplies a content-addressed upload identifier. This
changes correctly after remote rebase while preserving the durable command
idempotency key.

The backend stages chunks in PostgreSQL (migration 0020), each bound to
organization, board, authenticated actor and guest access epoch. It validates
per-chunk and full-envelope SHA, exact byte count, command schemas and ownership,
max 48 MiB, max 96 chunks, max 3 simultaneous uploads per actor/board,
and one-hour TTL. Authorization/CSRF and guest access epoch are rechecked on
each route. Existing `BoardPersistenceService.append_commands` verifies
Lamport/revision/idempotency and persists the complete batch as one revision.
The existing collaboration publication is sent once, after commit. Staged
uploads never publish partial revisions. The standard endpoint retains its
original request-size limit.

The local durable queue provides atomic group admission, rebase,
quarantine-on-conflict and idempotent reconnect. Cleanup of completed uploads
is attempted by frontend; expired uploads are pruned by the existing backend
artifact maintenance worker. All new routes preserve same-origin auth.

## Remaining limitations: do not close Issue #275 yet

- **Indivisible dependencies**: a single group, GeometryOS import or 3D solid
  requiring more than 5,000 object snapshots or 2 MiB cannot be serialized
  as one existing `clipboard.paste`. This requires a separate versioned
  staged graph restore/commit command and corresponding frontend reducer/
  backend canonical reader changes; publishing incomplete graph edges is
  prohibited.
- **Capacity**: requests above the 48 MiB staging limit require an explicitly
  bounded higher-capacity storage policy or paginated graph restore.
- 3D learning attempts removed by an earlier cut are not yet recovered by
  the existing inverse.
- Deployment requires a coordinated frontend/backend release, migration,
  real HTTPS host, backup and rollback procedure.
- Per-tenant quotas, staging races and a full end-to-end 10,000 varied stroke
  + 10-image scenario require independent exact-head testing before merge.

Do not merge both PRs or close #275 until all acceptance gates pass.
