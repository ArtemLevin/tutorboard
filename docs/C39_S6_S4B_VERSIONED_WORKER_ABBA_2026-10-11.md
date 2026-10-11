# C3.9-S6.4-B — versioned Worker content snapshots

Date: 2026-10-11  
Issue: [#201](https://github.com/ArtemLevin/tutorboard/issues/201)  
PR: [#228](https://github.com/ArtemLevin/tutorboard/pull/228) (**Draft**, stacked on experimental #227 → #226).  
Comparison code SHA: `96f13469b7dfb0cd24b9fd86dace0820da99bd53` (plus later memory eviction regression and documentation).

## Scope and confirmed root cause

Earlier S6 diagnostics found 10k dense BoardDocument validation on the main
thread takes hundreds of milliseconds per `viewport.set`, while cloning an
entire 10k-ink document in Worker `postMessage` adds roughly 100–150ms per
call. S6.4 reduced eager preparation yet a 350ms autosave debounce can expire
repeatedly during heavy wheel inputs.

S6.4-B retains one full document content version inside the serialization
Worker. Full `serialize` first passes **existing canonical validation** and
seeds the version identified by request ID only when valid. Later
`serialize-viewport` posts a compact `baseVersion`, `documentId`,
`viewport`, `updatedAt`, `id` request. Worker rejects unknown versions or
document IDs with `cache-miss`, reconstructs the full document from the cached
content graph, then runs the **same canonical validator/serializer** to
produce the exact persisted JSON bytes.

The client waits for a successful full-serialization acknowledgement before
using the compact protocol; a late superseded ACK cannot change the current
base version. Changes in any persisted content subtree invalidate the cache
candidate. After cache-miss or Worker error, client sends a full document again.
Existing synchronous lifecycle serialization and SHA-256 remain unchanged.
Only one full snapshot is retained on the Worker side; disposal or Worker
failure releases it. The persistence transaction, revision ID, operation ID,
canonical JSON schema, media formats and websocket contracts remain unchanged.

## Two-runner real-browser comparison

[GitHub Actions ABBA #38152819028](https://github.com/ArtemLevin/tutorboard/actions/runs/38152819028):
**success on two independent Chromium runners**, DPR2, 1240×820 CSS,
18 native wheel inputs per sample, 5000/10000 pen strokes and 4 PNG + 6 JPEG,
alternating baseline (A = S6.4 #227) / versioned Worker (B = S6.4-B #228).

| Runner | Variant | 5000 active p95 ms | 10000 active p95 ms |
| --- | --- | ---: | ---: |
| A | A1 | 450.0 | 366.7 |
| A | B1 | 200.0 | 383.3 |
| A | B2 | 233.3 | 366.7 |
| A | A2 | 283.3 | 383.3 |
| B | A1 | 183.4 | 333.3 |
| B | B1 | 166.7 | 283.4 |
| B | B2 | 166.6 | 300.0 |
| B | A2 | 150.0 | 783.4 |

Exploratory median-of-two comparison:

- Runner A / 5k: 366.7 → 216.7 ms (~41% improvement).
- Runner A / 10k: 375.0 → 375.0 ms (no improvement).
- Runner B / 5k: 166.7 → 166.7 ms (no improvement).
- Runner B / 10k: 558.4 → 291.7 ms (~48% apparent improvement,
  heavily influenced by baseline A2 = 783.4ms outlier).

**Message-level outcome at 10k (per sample)**:

| Runner | Baseline A full postMessage time ms | Candidate B full+delta postMessage time ms |
| --- | --- | --- |
| A | 874.6 / 930.4 | 124.8 / 117.7 |
| B | 799.2 / 731.9 | 117.2 / 102.6 |

Candidate B emitted one complete `serialize` per sample and 7–9
`serialize-viewport` messages; baseline A emitted 7–8 complete serialize
messages. This is strong evidence of reduced synchronous main-thread copying
and successful reuse of the Worker-owned snapshot.

The trace categories `viewport-local-autosave.schedule` and
`viewport-local-worker.postMessage` overlap; they must never be summed.
Active rAF p95, per-operation p95 and total `postMessage` time represent
different populations, and no measured amount is exclusive causal attribution.
Long frames continue because full-document reducer prevalidation is unchanged.

## Validation and safeguards

- New Worker serialization-cache unit tests: canonical JSON byte equality
  on normal and dense (128 strokes + embedded images) documents, invalid
  input, stale version, cross-document mismatch, version eviction after
  64 replacements, and bad viewport/updatedAt validation.
- New client unit tests: full seed ACK then compact delta, cache-miss full
  resynchronization, worker error/restart, content invalidation and
  out-of-order full ACK.
- Existing local-autosave lifecycle tests include synchronous `pagehide`,
  dispose, retry and optimistic concurrency. Existing worker SHA tests remain.
- Memory: implementation retains one Worker base and one current main-thread
  base reference; a 64-version eviction regression guards against accidental
  historical cache accumulation. **Worker-process heap soak and large memory
  measurements have not been independently established**; quantitative
  memory stability is still a release blocker.
- Provenance risk: main-thread `samePersistentContent` compares immutable
  content references. TypeScript's `readonly` declarations alone cannot
  prevent an externally held nested object from being mutated in place. Such
  mutation could make a Worker snapshot stale without changing references.
  **Do not merge until immutable ownership or equivalent deterministic
  provenance of all source content is enforced and regression-tested.**
- Production gate also requires fresh full-code CI, collaboration/undo/redo
  end-to-end and cross-browser save/reload/rollback before enabling by default.

## Release decision

**S6.4-B: implementation and protocol-copying hypothesis confirmed;
production performance NO-GO.** Required >=20% improvement at *both*
5000 and 10000 strokes on *both* independent runners was not met.
Leave PR #228 Draft; do not merge stacked #227/#226 into `main`. The next
root-cause priority remains S6.3: safe removal of repeated full-document
`validateBoardDocument` along trusted viewport commits. That work must keep
the public reducer's invalid-current-document boundary intact.

All timings, conclusions and gating decisions in this report apply to the
specified test run and code SHA; later documentation/test commits must have
their own CI verification.
