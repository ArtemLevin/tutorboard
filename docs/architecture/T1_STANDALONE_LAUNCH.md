# T1 — Standalone launch and guest routing

## Status

Implemented on top of B0/T0 frontend contracts and B1/B2 backend persistence/access.
The existing Board command envelope remains `1.5`.

## Canonical launch

Standalone boards are opened only through `/b/<boardId>#/board`.
`/b/<boardId>` is parsed before the product shell is mounted; any alternate hash is replaced with `#/board`.
The standalone path never mounts the lesson/product navigation shell.

Bootstrap is context-first:

1. parse and validate `boardId` from the URL;
2. request `GET /api/v1/boards/context?boardId=<boardId>` with same-origin credentials;
3. strictly parse the teacher/guest discriminated access context;
4. verify that the returned `boardId` is exactly the URL board;
5. bind `cacheScopeId`, `accessEpoch`, capabilities and actor to the sync engine;
6. load the board recovery package and only then render the board workspace.

Invalid, expired, revoked, mismatched or malformed access renders one non-enumerating unavailable state. The UI does not render the requested board ID or server problem detail.

## Principal isolation

The guest context schema is strict and rejects account/tenant fields. The teacher schema requires them.
The already-resolved standalone context is reused locally by collaboration bootstrap, so the guest runtime does not fall back to the unscoped legacy `/boards/context` bridge.

Guest unsafe HTTP requests automatically carry `X-Board-Access-Epoch` in addition to the existing CSRF header. Teacher requests do not add a guest epoch header.

The durable command/head stores continue to be scoped by `cacheScopeId + documentId`, with `accessEpoch` attached to pending commands. Neither CSRF values nor collaboration tickets are written to IndexedDB/localStorage.

## Least-privilege UI composition

Standalone mode mounts `SyncedApp` directly rather than `ProductShell`.
It therefore does not mount lesson/document/settings/diagnostics routes.
Inside board settings, application-level navigation and the legacy lesson sharing action are removed in standalone mode.

Capabilities are authoritative:

- board mutations require `board.write`;
- server snapshot creation requires `board.snapshot.write`;
- collaboration starts only with `collaboration.connect`;
- PDF export is exposed only with `board.export`;
- evidence and lesson telemetry execute only for legacy lesson launches.

Teacher and guest identity plus read-only state are rendered in the board settings panel.

## Pristine revision-zero boards

A read-only guest may be the first principal to open a newly created standalone board. T1 therefore no longer requires `board.snapshot.write` merely to materialize a pristine revision-zero document.

For `revision == 0` with no snapshot, the client deterministically uses the server board `createdAt` and the standalone title. A write-capable principal persists the revision-zero snapshot; a read-only principal renders the same deterministic document without a server mutation. This avoids a race where a guest arrives before the teacher.

## Compatibility

Local mode and legacy lesson-bound mode retain their previous composition and URL behavior. Legacy lesson board creation still occurs outside `BoardSyncEngine`. Existing WebSocket access-control events remain unchanged; live capability refresh/rebase semantics are reserved for B3/T3.

## T1 gates

Automated coverage includes:

- strict board-scoped teacher/guest context parsing;
- guest epoch header propagation;
- no unscoped context refetch after standalone bootstrap;
- canonical standalone route enforcement;
- read-only pristine guest launch without snapshot write;
- same standalone document launch for teacher;
- removal of teacher/product navigation from standalone UI;
- non-enumerating invalid access;
- absence of guest CSRF and WS ticket values from browser durable storage;
- existing local/legacy Chromium and Firefox smoke suites.
