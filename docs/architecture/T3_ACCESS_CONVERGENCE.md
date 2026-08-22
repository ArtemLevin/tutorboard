# T3 — live access convergence

Status: frontend implementation complete; cross-repository two-browser staging
gate pending.

## Runtime sequence

When collaboration publishes `access.capabilities.changed`, TutorBoard now:

1. synchronously closes the local mutation boundary;
2. stops the current collaboration socket and its reconnect timers;
3. refetches the strict board-scoped access context;
4. updates the HTTP transport epoch and CSRF context;
5. switches the durable queue to the refreshed access epoch;
6. quarantines superseded pending commands;
7. rebuilds the visible document from the confirmed head plus retained pending
   commands;
8. persists the refreshed confirmed-session metadata;
9. resumes synchronization and obtains a new one-time collaboration ticket.

The UI remains read-only throughout the transition. A retryable context failure
keeps mutations and collaboration blocked and exposes an explicit retry action.
An authorization failure (`401`, `403`, `404`, or `410`) enters the same terminal
unavailable surface as `access.revoked` and never starts a reconnect loop.

## Access-epoch invariant

A semantic capability change with an unchanged `accessEpoch` fails closed.
Changing the epoch removes old-epoch work from the active document as well as
from the durable pending queue. Restoring write access under a later epoch can
sync only commands created under that later epoch.

The refresh path also rejects changes to `boardId`, `cacheScopeId`, or principal
type. Those changes require a fresh bootstrap and a new sync engine.

## Verification in this repository

- sync-engine tests cover the synchronous mutation freeze;
- old-epoch pending work is quarantined and removed from the rendered document;
- write restoration cannot resurrect quarantined work;
- unchanged-epoch capability changes fail closed;
- HTTP adapter tests prove refreshed CSRF/epoch use and principal-scope guards;
- browser coverage injects a live capability event and verifies context refresh
  plus collaboration reconnect with the new epoch;
- existing `access.revoked` tests continue to prove terminal `4403` behavior.

The remaining release gate requires the real backend, PostgreSQL, Redis and two
isolated browser contexts. It must exercise offline guest edits, teacher
read-only/re-enable/revoke actions, multi-process event propagation and prove
that only new-epoch commands reach the server.
