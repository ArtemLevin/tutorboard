# T0 — Frontend security and architecture preparation

Status: implemented on `agent/t0-frontend-security-prep`; acceptance is gated by PR CI before merge.

## Purpose

T0 removes frontend assumptions that prevent a safe standalone guest-board runtime. It intentionally does **not** activate guest access. Backend persistence/invitations are B1/B2; standalone context-first composition is T1.

The command protocol remains `1.5` and the current revision journal is not rewritten.

## Work packages

### T0.1 — Launch context

Introduce one launch model for three entry modes:

- `local` — current local TutorBoard;
- `legacy-lesson` — `lessonId + documentId` compatibility path;
- `standalone` — `/b/<boardId>`.

Security rule: until B1/B2/T1 are available, a standalone route fails closed instead of silently opening an unrelated local document.

### T0.2 — Access and mutation contracts

Core owns runtime-neutral access types:

- principal type;
- capabilities;
- `cacheScopeId`;
- `accessEpoch`;
- mutation policy.

Legacy lesson sessions are normalized into a deterministic legacy security scope. `parent` remains read-only; `admin`/`tutor` retain legacy management capabilities.

The document command controller is the central frontend mutation boundary. It rejects command commit, undo and redo when write is unavailable. Feature-specific disabled controls remain UX only; correctness does not depend on hiding buttons.

### T0.3 — Least-privilege ports

The previous broad `BoardPlatformRepository` is decomposed into:

- `BoardSyncRepository`;
- `LegacyBoardLifecycleRepository`;
- `BoardCollaborationRepository`;
- `TeacherBoardAdministrationRepository`;
- `BoardEvidenceRepository`;
- `BoardTelemetryRepository`.

`BoardPlatformRepository` remains temporarily as a compatibility composition for the existing HTTP adapter.

The sync port owns only journal/snapshot transport. Board creation is not a sync responsibility.

### T0.4 — Sync engine decoupling

`BoardSyncEngine` operates on an existing board identified by `documentId` plus access context.

Rules:

1. no `ensureBoard()` call inside the engine;
2. no semantic dependency on `lessonId`;
3. legacy lifecycle preparation happens in app composition before bootstrap;
4. snapshot creation requires `board.snapshot.write`;
5. command push requires `board.write`;
6. newly queued commands store `accessEpochAtCreation`;
7. stale or unauthorized pending work is removed before network push;
8. capabilities/access epoch/principal type are exposed in ready state for UI composition.

The deprecated optional `lessonId` constructor field is accepted temporarily only to keep old callers/tests source-compatible during the migration. It is ignored.

### T0.5 — Principal-scoped IndexedDB

Dexie v4 is additive. Existing v1-v3 stores are retained for rollback and new scoped stores are added:

- `scopedHeads`;
- `scopedPending`;
- `scopedClocks`;
- `scopedQuarantine`;
- `scopedSequences`.

Compound keys include `cacheScopeId + documentId`; command/clock stores additionally include sequence/actor identity.

Upgrade copies existing rows into `legacy:lesson-bound:v1` with legacy access epoch. Runtime then uses only scoped stores.

This avoids attempting to mutate an IndexedDB primary key in place and keeps the migration recoverable.

Pending schema v3 adds local-only `accessEpochAtCreation`. It does **not** modify Board command envelope `1.5`.

When the active epoch changes:

- old-epoch commands move to quarantine with `access-epoch-changed`;
- valid current-epoch commands remain usable;
- old commands cannot reappear if write permission is restored later.

### T0.6 — Collaboration access control

The WebSocket adapter understands B0 control events:

- `access.capabilities.changed` — surfaced to composition for a future context refresh;
- `access.revoked` — terminal.

Terminal revoke behavior:

1. clear presence and ephemeral previews;
2. emit collaboration status `revoked`;
3. close with `4403`;
4. cancel reconnect timers;
5. refuse subsequent reconnect/start attempts on the same client instance.

T3 will connect `access.capabilities.changed` to the final context-refresh/reconnect sequence once B2 provides the standalone context endpoint.

## Compatibility strategy

T0 must preserve:

- local board startup;
- legacy lesson query startup;
- existing HTTP journal/revision behavior;
- command envelope `1.5`;
- current Smart Ink, graph, GeometryOS, 3D and export behavior;
- existing collaboration presence/preview protocol.

Standalone routing is recognized but intentionally not activated.

## Acceptance gates

### Static/build

- formatting;
- ESLint;
- TypeScript;
- architecture boundaries;
- production build;
- dependency audit;
- performance budgets.

### Unit/security

- local/legacy/standalone launch parsing;
- legacy tutor write vs parent read-only capability mapping;
- same board in different cache scopes remains isolated;
- old access epoch is quarantined;
- new epoch is not blocked by old quarantined work;
- v2 durable state upgrades into scoped v4;
- confirmed head digest is still validated;
- concurrency/sequence clocks still prevent replacement overwrite;
- access revoke is terminal with no reconnect;
- capability-change events remain non-terminal.

### Regression

- server-sync suite;
- Chromium and Firefox browser smoke;
- GeometryOS live browser contract;
- Coordinate Plot production gate;
- Smart Ink production gate;
- Formula recognition production gate;
- production image scan.

## Rollback

- old IndexedDB stores remain present;
- no command-envelope migration occurs;
- standalone route remains feature-inactive;
- B0 contracts remain valid independently of T0;
- reverting the frontend PR does not require deleting server data.

## Handoff to next steps

After T0 is merged:

1. **B1** may safely add standalone ownership/persistence because frontend sync no longer owns creation;
2. **B2** may add invitations and guest sessions around the frozen B0 contract;
3. **T1** can activate context-first `/b/<boardId>` bootstrap using the already prepared access, cache-scope and mutation boundaries.
