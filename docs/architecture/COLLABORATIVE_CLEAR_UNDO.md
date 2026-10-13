# Collaborative Undo after clear

Review block 4, 2026-10-13. Base: main `3f5e526` (queue and owned snapshots).

## Availability and execution

Previously every changed sync document was compared through two full JSON
serializations. Then each retained inverse was applied to a temporary document.
For a clear inverse this recreated all removed objects just to decide whether
Undo was available, including on remote title or viewport updates.

The workspace now indexes the IDs of self-contained clipboard restores generated
from successfully committed local cuts. Object, group, geometry import and solid
ID collisions are checked against the current content maps. An empty board does
not require traversing the old restore payload. Metadata-only updates preserve
availability when content identity is unchanged. The immutable snapshot contract
makes reference comparison sufficient for detecting unchanged content.

The certificate is scoped to the exact locally generated inverse array through
a WeakMap. The array, paste command and its generated arrays are frozen; their
values refer to validated owned snapshots. Registration verifies that restored
IDs match the cut and that all restored references are self-contained. An
unregistered inverse or an inverse relying on external references keeps the
previous reducer probe. The helper is not a validator for arbitrary commands.
Actual Undo still runs the reducer and durable sync engine, including actor,
capability, access epoch, remote rebase and server hash checks.

## Pending local commits

Late bootstrap or old command acknowledgements may arrive between a local clear
and its durable projection. The workspace retains its optimistic document and
defers availability pruning while local commits are pending. When they settle,
it checks against the current sync state. Immediate Undo waits for preceding
local commits before calling engine.apply, so the restore is applied to the
post-clear document. Offline commits still settle after their durable projection;
Undo then remains in the normal durable pending queue.

## Existing transport limits

A clipboard paste is limited to 5,000 entries per object/group/import/solid array
and 2 MiB command JSON. Registration checks these limits once and does not retain
the temporary JSON. A cut whose restore exceeds them does not add an unusable
Undo entry. This does not extend large-clear recovery support: the varied-stroke
fixtures at 3k and 10k exceed the existing byte/count bounds. The target limit for
a cut itself remains 10,000. Protocol and security limits are unchanged.

Follow-up: design an atomic, bounded multi-command restore protocol for large
clears before promising shared Undo for those boards. Existing inversion also
does not restore removed 3D learning attempts; this remains separate backlog.
This block does not establish a general rendering performance GO or close #201.

## Evidence

- A detached base worktree with the new real-engine/IndexedDB component guard
  fails for 1k and 10k strokes: a remote title update invokes clipboard.paste
  once instead of zero. This run explicitly settles bootstrap before clear.
- Without settling bootstrap, the base also reproduces removal of the valid
  1k-stroke Undo by a late ACK. The candidate retains it.
- Candidate tests check generated restore parity with the full reducer for
  object, group, import and solid ID collisions; unrelated peer edits survive
  actual Undo. Unknown inverses keep full validation.
- Real engine and IndexedDB tests cover 1k/10k clear, remote updates, rejected
  oversized restore and immediate Undo before the clear's append/ACK completes.
- The standalone pilot browser suite includes two real teacher/guest sessions:
  clear and immediate Undo, clear and peer drawing then Undo, both peers reload.
  The existing suite retains reconnect, read-only, access change and revoke gates.

Local `npm run check` passed 1,205 tests and 28 performance checks, including
contracts, formatting, lint, typecheck, architecture and production build.
The targeted Chromium run passed 23 history, clear-memory, persistence/recovery
and selection cases. Exact-head CI and real-backend results are recorded in the PR.
Production delivery remains a separate release-pin/pilot/rollback process.
