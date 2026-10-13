# Immutable snapshots and incremental pending projection

Review blocks 2–3, 2026-10-13. Base: main `6146118` (local persistence block 1).

## Root causes

Each local queue append replayed the entire pending prefix from the confirmed
head, then serialized and rewrote that prefix through reconciliation. Forty
offline commands caused 820 reducer calls. Synchronization repeated replay
between successful acknowledgements even when the optimistic projection had
not changed. Separately, each reducer call parsed and cloned the complete board,
including metadata-only changes.

## Pending projection

The engine retains a checked optimistic projection of the confirmed head plus
the ordered pending prefix. A newly durable group is applied only to that
projection. Successful appends leave durable command payloads intact. If a new
group conflicts, quarantine remains atomic for that group; reconciliation is
limited to its own sequences and preserves older and concurrently enqueued work.

Remote batches, conflict responses, duplicate acknowledgement, access changes
and recovery invalidate the projection. The remaining prefix is replayed before
it is reused. Ordinary successful server acknowledgement does not invalidate it:
the confirmed head consumes exactly the checked prefix, preserving the result.
New work accepted while a network request is pending still enters the durable
queue immediately and is projected through the existing serial drain.

Failed conflict-store writes keep durable pending items in memory and mark the
projection for rebase. A later append must rebuild it before publishing a new
optimistic state. Server hashes, ordered envelopes, stable operation identity,
access epochs and quarantine rules remain authoritative and unchanged.

## Snapshot ownership

An internal WeakMap recognizes only exact board roots certified here. Full
validation first clones external input; recursive freezing then prevents mutation
of the owned graph. Readers produce owned snapshots before the first interactive
command. Caller-owned inputs and new command payloads remain independent and
mutable; a forged frozen root or a shallow copy has no ownership certificate.

Owned transitions reuse registered immutable records and values. New values
still pass strict schemas and are independently cloned. Metadata-only transitions
validate metadata and timestamps without traversing unchanged content. Content
changes retain record identity, order, membership and cross-reference checks;
changed ink and plot definitions retain their semantic checks.

Weak root, field and value registries do not retain discarded documents. The
public full validator continues to inspect external data. Canonical serialization,
SHA-256 computation, stored schemas and transport protocols are unchanged.
Legacy migrations still pass full checks before their reader result is owned.

Smart Ink and handwriting controllers retain the stored source strokes after
commit. Structural equality compares JSON-shaped values independently of key
order, preserving stale-source rejection after safe schema copying.

## Regression evidence

- The 40-command guard fails against the original sync engine with 820 calls.
  The candidate applies 40 commands offline and 40 more to confirmed heads
  during reconnect, with no ordinary prefix reconciliation.
- Real IndexedDB tests retain a 40-command prefix, reject a conflicting group
  atomically and recover from an injected conflict-store write failure.
- Existing tests cover 409 rebase, uncertain response/restart, atomic groups,
  concurrent durable enqueue, access rotation, revoke and collaborative Undo.
- Ownership tests cover deep immutability, independent inputs and payloads,
  modified ink, forged record keys, strict extra fields, historical roots and
  one full reader validation before the first interactive command.
- Local full check passed 1,193 tests and 28 performance checks before the final
  additional storage-failure regression. Browser and exact-head CI results are
  recorded in the PR and the accompanying local profile report.

The final local browser run passed 40 cases: 29 Smart Ink, handwriting,
selection/history, persistence/recovery and clear-memory cases plus 11 existing
C3.9 profiles. Two additional 5k/10k runs completed for both candidate and base.
The numerical observations are archived in
`docs/performance/incremental-sync-owned-snapshots-local-2026-10-13.json`.

| Scene | Base reducer p50, A1/A2 | Candidate reducer p50, B1/B2 |
| --- | --- | --- |
| 5k strokes + ten PNG/JPEG | 127.8 / 90.3 ms | 0.2 / 0.2 ms |
| 10k strokes + ten PNG/JPEG | 190.6 / 170.8 ms | 0.2 / 0.2 ms |

These local traced Chromium observations establish elimination of repeated
validation work, not replicated frame-performance release evidence. A1 overlapped
part of a unit test run; all valid observations are retained. At 10k, active
frame p95 ranges overlap (base 316.7–383.3 ms, candidate 300.0–316.6 ms).
No general 20% latency GO is claimed.

## Limits

Content edits still traverse cross-reference invariants and copy changed record
maps. Queue array bookkeeping and durable enqueue scans are separate costs.
Serialization/hashing still perform full document work at their boundaries.
Loading a large document includes one full parse, clone and freeze before use.
An import sanitizer or other external builder can create an uncertified derived
root; its first reduction still performs a complete check before reuse.
These changes do not establish the general C3.9 rendering release gate or close
issue #201. The independent collaborative Undo availability cache is outside
these two blocks.
