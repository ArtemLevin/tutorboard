# C3.9-S6.4 — viewport autosave coalescing: paired ABBA result

Date: 2026-10-11. Parent: PR #226 (S6.1–S6.2). Candidate: [PR #227](https://github.com/ArtemLevin/tutorboard/pull/227). Issue: [#201](https://github.com/ArtemLevin/tutorboard/issues/201).

## Change and semantics

`LocalDocumentAutosave.schedule` formerly invoked `repository.prepareSave`
for **every** new document, which started Worker `postMessage` and a
synchronous full-document structured clone during wheel gestures.
S6.4 defers eager preparation **only** for a revision sharing all persistent
content and metadata except `viewport` / `updatedAt` with the most relevant
queued, active or last persisted document. It preserves the existing autosave
timer, full document validation/serialization by `repository.save`, pagehide
lifecycle save, operation ID, revision conflicts, errors and retry semantics.
Content changes still prepare eagerly.

The change is safe to experiment with; deferral never means skipping durable
serialization. Regression tests cover viewport-only coalescing, content change
invalidation and synchronous pagehide flush.

## Paired browser evidence

[ABBA workflow #38150973467](https://github.com/ArtemLevin/tutorboard/actions/runs/38150973467):
**SUCCESS**, Chromium DPR2, 2 independent GitHub runners, real 5k and 10k pen
strokes + 4 PNG and 6 JPEG, 18 native wheel events each. Each runner built
and executed frozen parent A / candidate B / candidate B / parent A, with the
same exact dependencies and fixture. Each sample is one 18-wheel run.

| Runner | Variant | 5000 active p95 (ms) | 10000 active p95 (ms) |
|---|---|---:|---:|
| A | A1 | 316.6 | 416.7 |
| A | B1 | 216.7 | 366.7 |
| A | B2 | 233.4 | 366.6 |
| A | A2 | 366.7 | 400.0 |
| B | A1 | 166.7 | 333.3 |
| B | B1 | 166.8 | 333.3 |
| B | B2 | 233.3 | 333.4 |
| B | A2 | 183.4 | 816.6 |

**Median of two samples per variant (non-paired exploratory statistic):**

- Runner A, 5000: parent 341.7ms vs candidate 225.1ms (~34.1% gain).
- Runner A, 10000: parent 408.4ms vs candidate 366.7ms (~10.2% gain).
- Runner B, 5000: parent 175.1ms vs candidate 200.1ms (~14.3% regression).
- Runner B, 10000: parent 575.0ms vs candidate 333.4ms (~42.0% gain),
  heavily influenced by a single 816.6ms A2 outlier.

Worker `postMessage` clone count for 10k: runner A A1/A2 = 9/11,
B1/B2 = 7/8; runner B A1/A2 = 10/10, B1/B2 = 8/7.
The candidate reduces clone frequency, yet significant cloning remains because
350ms debounce expires *during* slow long-wheel sequences. Full document
prevalidation remains the other large synchronous cost.

This test's trace clock spans overlap. `autosave.schedule` **includes** worker
`postMessage` on many calls; never add those durations. Active rAF p95 is
not the same metric as per-operation p95. The 816.6ms A2 outlier makes
apparent 10k runner B uplift unreliable.

## Gate and decision

**Performance NO-GO for candidate S6.4:** required >=20% improvement at both
5000/10000 and on both independent runners is unmet. No main merge. This
result is more meaningful than comparing unpaired CI attempts. The production
correctness release gate still requires final-head clean CI; functional tests
run separately.

## Next research decision (S6.3 / S6.4-B)

- **S6.3:** reduce full-document `validateBoardDocument` frequency only
  through explicit, enforceable immutable ownership/provenance of the document.
  A WeakSet/WeakMap keyed on mutable snapshots would undermine public
  `reduceBoardDocument` validation of `command.invalid-current-document`.
  This shortcut is forbidden.
- **S6.4-B:** investigate a content-versioned Worker protocol. Prime Worker
  exactly once per authoritative content version; send only viewport and
  timestamp changes until objects/order/groups/metadata change. Explicit
  Worker ACK/version conflict handling, resync after crash, out-of-order
  queue semantics, deduplication, memory bounds and pagehide synchronous
  fallback are prerequisites. Keep canonical serialized bytes, SHA, security
  and persisted schema stable. If complexity outweighs measurable gain,
  reject proposal and retain existing full-document path.
- Retest paired ABBA with the same 5k/10k fixtures, both runners, and complete
  real lifecycle/undo/redo/offline collaboration before production GO.

The current S6.4 PR is retained as a Draft experimental branch only.
