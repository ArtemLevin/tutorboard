# C3.9-S3 — implementation evidence and release gate

Date: 2026-10-10. [Issue #201](https://github.com/ArtemLevin/tutorboard/issues/201).
[Draft PR #217](https://github.com/ArtemLevin/tutorboard/pull/217).

## Scope implemented in the experimental branch

- `createBoardSceneSelector()` retains `scene.items` only when document ID and the immutable renderer dependencies `objects`, `order`, `groups`, `geometryImports` are referentially identical. The viewport wrapper is fresh, `previousDocument` is updated and reset/cacheSize interfaces are unchanged.
- Unit checks cover viewport and metadata changes, visibility membership and dependency invalidation, reset, document switching and object deletion.
- Instrumented visibility-index, visibility-query, paint-run and transformer-bind durations and per-input numeric session/viewport details. Trace sink tracks overflow; production never injects a recorder.
- Existing C3.9 historical active/commit/settling phases remain unchanged. Additional active-with-persist and active-without-persist phase distributions identify mixed frames without exclusive CPU assumptions.
- Full bounded rAF/JS/CDP arrays and synthetic document SHA-256 are attached per scenario to Playwright test reports, with dropped counts.
- The static-heavy and representative benchmark workflows include selectors/renderer changes in their path filters.
- A new `c39-s3-abba.yml` builds A0/A1 from the **same candidate harness**. The A0 worktree restores only the exact selector file from the PR base, preserving identical recorder and test code. Three ABBA cycles are run on each of two independent GitHub runners (six adjacent matched pairs per runner), using the four static-heavy 3k/5k/10k/offscreen scenarios. All evidence is archived.
- The A/B parser rejects missing inputs, changed codec/object counts, changed fixture hashes, unaligned traces and overflow. Its local classification is a research result, never authorization to merge.

## Gates and constraints

This branch must remain experimental until the A/B workflow produces complete, comparable results, the general CI passes, and pixel/hit/pen-input and lifecycle tests are verified. A measured median active-p95 gain of at least 20% for 5k and 10k, no >10% reproducible regression in 3k/offscreen, no pen/persist/memory regression, and full correctness are required.

The production contract retains validation, save/restore, undo/redo, media content and hit canvas. Persisted document schemas, authz, public JSON import cap (10 MiB), and `buildIfUnprepared: false` are unchanged. The cold-cache experiment in PR #216 is excluded.

Remaining work: release-quality pen input-to-paint and pixel/hit evidence, full browser/cross-browser gates, evaluation of independently replicated A/B metrics, and rollback/merge decision. C3.9-E/F and teacher/guest soak remain outside this narrow candidate and Issue #201 stays open.

**Caution:** A fast selector identity check proves eliminated CPU work; it alone proves no end-user frame-latency improvement. The evidence gate must decide.
