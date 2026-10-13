# C3.9 — prevalidated viewport ownership at board entry

Date: 13 October 2026. Issue #201; PR #253 merged.
Prior experimental PR #254: 5k P95 below 20% gate, 10k P95 NO-GO.
The first wheel previously spent 320–375ms parsing/freezing 10k ink.

This candidate prepares the immutable graph at controller creation and any
external document identity hydration, before the board accepts wheel events.
The full schema and semantic validator independently clones the source;
only the clone is recursively frozen. The externally supplied document stays
mutable, and a change to it with a new reference forces revalidation.

The fast path trusts only the exact last frozen root owned by this session.
Metadata and strict viewport/timestamp validation still run; the viewport
payload is detached from the command. Public reduceBoardDocument, external
read/import validation, wire, persistence, permissions and history shape are
unchanged. Content edits, batches, undo and redo invalidate owned revision.
The first wheel after such a change can still be cold; moving its full
clone onto every pen stroke would create a separate input-latency regression.

Caveats: first load/hydration may be slower and increase temporary memory.
Performance GO requires two-runner paired 5k/10k Chromium ABBA with 4 PNG,
6 JPEG, DPR2, >=20% active P95 speedup per runner and no regressions in
pixel/hit/undo/reconnect/memory. Keep Draft until evidence is complete.
