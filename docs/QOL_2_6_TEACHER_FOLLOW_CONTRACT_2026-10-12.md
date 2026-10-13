# QoL 2.6 — Teacher Follow Mode (frontend using existing presence transport)

## Existing backend contract

Verified against `ArtemLevin/tutor-assistant-web` `main` at
`301928ac34d901fc72b6117ef452ec179fb978ee`,
`src/tutor_assistant_web/modules/boards/collaboration.py`.

The current `tutorboard.v1` presence protocol already includes optional
`viewport: {x,y,zoom}` in `presence.updated` and `presence.snapshot`.
The server obtains `role`, `actorId`, `clientId` from its authenticated
ticket, not from user-supplied JSON, and publishes within the ticket's
organization/document room. Server viewport hints are bounded to
`[-1_000_000,+1_000_000]` offsets and `(0,64]` zoom; the rendering
client accepts only the narrower canvas zoom range `[0.1,8]`.
The existing frontend presence writer coalesces updates at 50 ms
(<=20 sends/s per client), subject to server traffic rate limit.

**No new protocol type, persisted schema, capability, backend endpoint or
server migration is required for this implementation.** Older clients
continue to consume the same presence payload and can ignore the follower UI.

## State ownership and isolation

- Teacher participation and viewport hints are server-issued presence values.
  Only tutor/admin role qualifies as a source; a student cannot pose as a
  teacher by editing browser JSON.
- The student opts in explicitly from the board. Follow is OFF on every load.
- The active target is pinned by board, student actor, local cache scope,
  accessEpoch, teacher actor and teacher clientId.
- Offline, access refresh, role/scope change, participant exit and reconnect
  invalidate the active selection. A reconnect requires a new student click.
  In the existing WebSocket adapter, a fresh `presence.joined` invalidates
  earlier viewport/previews/sequence for the same `clientId`; otherwise a
  reconnect reusing that ID can leave stale teacher camera data.
- Student navigation is a local camera from initial board load, whether
  writable or read-only. Followed camera updates bypass `core.viewport.set`,
  `BoardDocument`, revision, queue, undo/redo and local saved bookmarks.
- Manual pan, wheel, zoom fit and bookmark navigation switch Follow OFF.
  Local presence publishes the student's independent viewport, so following
  another participant cannot cause a feedback/rebroadcast loop.
- On disconnect or manual exit the last displayed viewport is retained as
  the student's local viewport.
- The connected teacher's normal viewport navigation remains unchanged;
  this feature transmits/consumes its existing presence hints only.

## Verification

- Unit: teacher authorization, invalid camera bounds, actor/connection/scope,
  offline/epoch isolation.
- Fullstack two-client: explicit guest opt-in, independent camera while OFF,
  visible teacher zoom while ON, manual wheel exit, offline/reconnect OFF,
  read-only navigation without commands, access capability rotation, revoke.
- Standard CI: format, lint, typecheck, unit, performance, production build,
  Chromium/Firefox smoke, full applicable release gates.
- Deployment remains a separate controlled-pilot release gate.
