# P1 durable sync and lifecycle review

Base: `da10527` (P0 PR #154). Scope: five operational findings in the
2026-09-30 code review. No backend protocol, document schema, dependencies or
production deployment changes.

## Contract and ownership

| Finding | Invariant owner and change | Regression evidence |
| --- | --- | --- |
| QUEUE-BATCH | Dexie reconcile preserves persisted batch identity; server-sync compares canonical command JSON | Real IndexedDB reconcile/reopen; accepted response lost then engine restart without another push |
| QUEUE-ATOMIC | Required queue port `enqueueBatch` commits entries, actor clocks and sequence clock together; `acknowledgeBatch` deletes a group in one transaction | Second IDB insert failure rolls back all rows and clocks; second delete failure preserves whole group; queueBatch and undo restart never send a prefix |
| QUEUE-ORDER | Dexie enqueue/list/reconcile never lower an actor clock | Two instances on one database; older reconcile, newer ack, list, enqueue; simultaneous groups allocate non-interleaved sequences and increasing Lamport |
| STRICTMODE | App effect owns engine; standalone effect owns Dexie; cleanup makes old callbacks inactive | StrictMode on/off reaches ready once; real standalone workspace opens; obsolete bootstrap rejection cannot replace current UI |
| ACCESS-RECONNECT | WebSocket client handles HTTP 401/403/404/410 before a socket exists, with one successful access refresh per reconnect episode | Stale CSRF refresh then success; permanent denial bounded to two tickets; no handler stops immediately; network/503 backoff; stale generation ignored; close 4403 notifies owner |

Affected PLAN §2 invariants: 1 (revision/idempotency/Lamport), 3 (server access
authority), 4 (principal scope), 5 (epoch), 6 (terminal revoke), 8 (ticket
lifetime). Current PLAN has numbered invariants, not ARCH-* identifiers.
Module boundaries remain core ports → adapters and app composition; domain
code does not import UI/storage/network.

The engine replays a group against a temporary document and commits the result
only if every member applies. Conflicting groups are quarantined together.
If a persisted member fails validation, its decoded group prefix and dependent
tail are also quarantined; raw storage records retain recovery metadata.
Remote duplicate acknowledgement checks command content canonically and rejects
different payloads under the same key. Conflict responses use the same duplicate
handling as pull/bootstrap. If a newer snapshot covers uncertain pending work,
bootstrap first reads the intervening journal, checks contiguous revisions and
matches complete groups before replay. Missing history produces explicit recovery
instead of resending an unverifiable group.

## Compatibility and recovery

- Pending record schema v3 and IndexedDB database version 4 are unchanged.
  Existing v1/v2 migration paths and scoped storage remain supported.
- `PendingBoardCommandQueue` gains two required methods; the production Dexie
  adapter and both in-memory test adapters implement them. Multi-command writes
  have no fallback to independently committed single-command writes.
- Confirmed server revisions remain authoritative. Pending rows are retained
  when a ticket is denied, and a refresh with changed rights still passes the
  existing scope/epoch validation before synchronization resumes.
- Crash before/during transaction: the complete transaction rolls back. Crash
  after enqueue: the whole group is recoverable. Crash during acknowledgement:
  the group remains whole or is fully removed. A later bootstrap rebuilds the
  confirmed head from the server journal.
- This fix cannot reconstruct data already lost by an older client: a historic
  prefix lacking its missing members or stripped batch metadata has no reliable
  completion marker. Preserve the database and compare with the server journal
  or explicit user recovery export; do not infer or automatically resend missing
  commands. No destructive cleanup or heuristic migration is introduced.
- Stored shape permits rollback, but rollback to the prior client reintroduces
  partial-write/ack and clock risks. Prefer forward correction; do not clear
  browser data. Already-open old tabs need a reload to use the fixed writer.

## Verification

Regression suites:

- `tests/unit/adapters/persistence-dexie/sync-queue.test.ts`
- `tests/unit/modules/server-sync/sync.test.ts`
- `tests/integration/coordinate-plot-sync.test.ts`
- `src/app/SyncedApp.test.tsx`
- `tests/unit/adapters/board-websocket/access-control.test.ts`

Local evidence:

| Check | Result |
| --- | --- |
| `VITEST_MAX_WORKERS=2 npm run check` | PASS: 167 test files / 858 tests, 8 performance tests, both contract checks, format, lint, typecheck, architecture, full build |
| Snapshot-history recovery follow-up | PASS: 22 sync tests, lint, typecheck and full build after deferring acknowledgements until all history pages are read |
| Board profile (`VITE_APP_PROFILE=board VITE_APP_STAGE=production npx vite build`) | PASS |
| Chromium/Firefox browser smoke | NOT RUN locally: Playwright Chromium download produced an invalid archive |
| GitHub PR / CI | Publication and merge explicitly authorized on 2026-10-01 without waiting for CI; actual run status is available on the PR |

The user explicitly authorized push to `ArtemLevin/tutorboard`, PR creation and
merge on 2026-10-01, and requested that merge not wait for successful CI. Local
checks above remain the verification evidence; browser CI is not claimed green.
No production deployment was attempted.

## Adversarial review

Reviewed failure points: serialization/hash before transaction; IDB failure
between members; ack failure between deletes; two independent database
connections; damaged second group member; server commit with lost response;
canonical field-order changes after decode; grouped replay failure; StrictMode
setup/cleanup/setup; late bootstrap/refresh; obsolete WebSocket generation;
terminal ticket denial before ready; temporary refresh outage; close 4403.

The restart regression exposed order-sensitive JSON equality, now replaced by
the existing command codec's canonical JSON. No permission is inferred from
feature flags or retryability. No additional token logging or dependency edge
was introduced. Production load, live backend E2E and already-corrupted
historical databases require their own operational evidence.
