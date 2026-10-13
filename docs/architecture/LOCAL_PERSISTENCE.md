# Local persistence and recovery

PR 2.6 adds IndexedDB durability without changing `BoardDocument 0.1` or making
IndexedDB a second editable source of truth.

## Ownership

| Owner | Responsibility |
| --- | --- |
| `core/ports` | Repository, revision, operation, recovery and diagnostics contracts |
| `adapters/persistence-dexie` | Dexie schema, transactions, stored-record validation and repair |
| `modules/local-persistence` | Debounced autosave, retry identity and diagnostic import |
| `app` | Adapter wiring, browser download/upload and user-visible recovery states |

The dependency direction remains:

```text
app -> modules/local-persistence/public -> core/public
app -> adapters/persistence-dexie/public -> core/public
```

Only the persistence adapter imports Dexie or accesses IndexedDB.

## Source of truth and writers

During the Technical Spike the in-memory `BoardDocument` owned by the application
is the active source of truth. The repository stores immutable serialized
snapshots. A restored snapshot becomes the next in-memory document only after the
core reader validates it.

The persistence adapter owns all durable writes. Autosave uses `save` for ordinary
writes and the optional `saveLifecycleBatch` for an accepted chain during
pagehide or workspace disposal; it never writes tables directly. The save transaction atomically:

1. checks durable operation identity;
2. checks the expected current revision;
3. appends a new immutable revision;
4. advances the document head and last-good pointer;
5. clears an obsolete recovery record;
6. compacts obsolete snapshots within the same transaction.

A failed transaction cannot publish a new head without its revision. Existing
revisions are never overwritten by normal save.

Lifecycle batches synchronously serialize the active and queued snapshots before
awaiting IndexedDB. They do not wait for an older Worker response. Only the first
expected revision is supplied by the caller; subsequent operations follow the
previous result. Any invalid snapshot, operation collision or revision conflict
rejects the batch without partial writes. Late Worker responses remain subject
to the same operation identity and revision checks.

Revision retention targets eight snapshots and 32 MiB of estimated UTF-16 JSON
payload per document. At least two snapshots and the current/recovery anchors
are retained even when their size exceeds the budget. Legacy history is compacted
on the next successful save. This disk history is separate from in-memory Undo.

## Idempotency and conflicts

Each autosave task creates one `PersistenceOperationId`. An uncertain failure is
retried with the same ID. The unique operation index returns the existing
revision when the operation and serialized content match, so retry cannot create
a duplicate revision.

The caller supplies `expectedRevisionId`. A changed head returns `conflict` and
never performs a silent last-write-wins overwrite. Multi-tab synchronization is
outside the spike; conflict UI instructs the user to export diagnostics and
reload.

## Recovery

Load validates both storage envelopes and `BoardDocument` content. If the current
revision is invalid, unknown or missing, the adapter records the untouched raw
input and searches older revisions in descending sequence order until the first
compatible snapshot. A valid current revision is loaded directly by key without
reading historical JSON. The newest compatible revision becomes the
repaired head and opens with a visible recovery notice.

When no compatible revision exists, the board is not rendered from corrupted
data. Recovery UI allows the user to:

- export the complete diagnostic bundle;
- import a compatible BoardDocument or diagnostic bundle;
- start a clean revision while retaining the damaged history.

The Dexie schema has an explicit ordered migration registry. Version 1 introduces
`documents`, immutable `revisions` and `recoveries`. Compaction deletes obsolete
revisions without a schema migration. `BoardDocument` remains at
schema `0.1`; no document migration is required by PR 2.6.

## Enforcement

| Invariants | Evidence |
| --- | --- |
| `ARCH-001`–`ARCH-004` | public imports and Dexie ownership architecture test |
| `DOC-001`, `DOC-002`, `DOC-007`–`DOC-009`, `DOC-012` | unchanged core schema, reader and serialization fixtures |
| `PERSIST-001`–`PERSIST-006` | repository, autosave, corruption and browser reload tests |

## Residual risks

- Autosave uses a 350 ms debounce. An abrupt browser-process termination before
  the timer fires can lose only the latest unsaved in-memory change; previously
  committed revisions remain intact.
- Lifecycle flushing cannot guarantee completion after an abrupt browser-process
  termination. Large snapshots also require synchronous serialization during
  pagehide; ordinary background saves continue using the Worker.
- Retention budgets exclude media stored separately and diagnostic recovery raw
  data. Oversized current and fallback snapshots are preserved for data safety.
- Multi-tab writes are detected through optimistic revision conflicts, but the
  current resolution flow is export diagnostics and reload rather than automatic
  merge.

Server revisions, offline queues, archive and the local-to-server source-of-truth
transition remain assigned to later phases.
