# T2 — teacher standalone board workspace

## Scope

T2 adds the authenticated teacher workspace at `/boards` on top of the frozen `standalone-board/1.0` contract and the B1/B2/T1 runtime.

The workspace is a management surface only. It does not participate in board revision sync and does not change command envelope `1.5`.

## Bootstrap and authorization

`/boards` resolves an authenticated teacher management context through the existing transitional unscoped `GET /api/v1/boards/context` bridge. The response is parsed with a strict teacher-only schema containing only:

- `userId`;
- `organizationId`;
- `role = admin | tutor`;
- `csrfToken`.

A guest context, unauthenticated response, malformed response or additional guest-only fields fail closed before the board-management repository is mounted. Guest clients therefore do not call list/create/invitation endpoints from this route.

All unsafe management requests carry the in-memory teacher CSRF token and `credentials: same-origin`. The Board API base URL must remain same-origin and may not contain URL credentials.

## Board workspace

The teacher can:

- list active and archived standalone boards;
- create a board;
- open a board through `/b/{boardId}#/board`;
- rename;
- toggle the board-wide `guestWritesEnabled` kill switch;
- archive and restore;
- soft-delete after an explicit inline confirmation;
- see current revision, updated time and active invitation count.

Board-list data remains server-authoritative. Every mutation is followed by a fresh list read.

## Invitation manager

Each board has a dedicated invitation dialog supporting:

- display name;
- expiry presets: 1 hour, 24 hours, 7 days or until revoked;
- per-invitation write permission;
- status: never used, active, expired or revoked;
- last-use metadata and use count;
- rename/update;
- revoke;
- rotate.

The board-wide guest-write switch and per-invitation write flag are presented separately because effective write authority is their conjunction on the backend.

## Raw invitation secret lifecycle

The raw `joinUrl` is accepted only from create and rotate responses. Invitation-list parsing is strict and rejects a `joinUrl` field if the server ever leaks it.

The raw link:

1. is held only in transient React state;
2. is never written to localStorage, sessionStorage or IndexedDB;
3. is removed when the result panel is dismissed;
4. is removed when the invitation dialog is closed;
5. cannot be reconstructed from the invitation list;
6. requires rotate to obtain a new raw link later.

Clipboard failure is recoverable: the read-only input is focused and selected for manual copying.

## Accessibility and responsive behavior

Management dialogs use the native modal `<dialog>` element, preserve Escape close behavior and restore focus to the invoking control. Primary create flow is keyboard-operable. Controls expose labels for write-policy toggles, expiry, copy, revoke and close actions.

The workspace reflows to a single-column board/invitation layout on narrow screens and removes animations when `prefers-reduced-motion` is enabled.

## Tests

T2 adds:

- strict management HTTP adapter unit tests;
- CSRF and same-origin tests;
- regression preventing raw secret leakage from list responses;
- cross-origin join URL rejection;
- Chromium/Firefox browser coverage for keyboard create, transient link handling, clipboard fallback, invitation write/revoke/rotate, global read-only, rename/archive/restore/delete and guest route denial.

## Rollback

T2 is frontend-only and additive. Rolling back the UI does not modify B1/B2 database state or standalone API contracts. Existing `/b/{boardId}` T1 launch and legacy/local modes remain independent.
