# C3.9-E1 — paired browser evidence for viewport optimization

Date: 2026-10-10. Tracking issue: [#201](https://github.com/ArtemLevin/tutorboard/issues/201).

## Why

PR #209 measured approximately 50% lower synchronous viewport reducer CPU
against an equivalent second-full-validation reference. That does **not**
establish smoother wheel interaction in Chromium. Representative mixed-media
browser runs still report >100 ms frames. CPU validation, Konva draw, and
Chromium compositor/raster scheduling must remain distinguishable.

## Implemented comparison gate

The opt-in, manual
[`C3.9-E1 paired browser comparison`](../.github/workflows/c39-paired-release-evidence.yml)
workflow builds **two pinned immutable frontend revisions in separate git
worktrees** on the same Linux runner. It executes a single existing C3.9
representative browser scenario chronologically as A–B–B–A for five or eight
cycles. Every execution uses a fresh Playwright browser context, identical
1240×820 viewport and scenario-defined DPR, six 1536×1536 PNGs, four
multiframe GIFs in the animated scene, and the deterministic varied-stroke
fixture. It retains original test behavior and opt-in trace instrumentation.

Default baseline is `1bf2487d814a8dacde0ddc55ac57678f0b7b65c1`,
the main commit immediately before the C3.9-D merge. Candidate defaults to
the selected workflow ref SHA. Inputs accept **only** full 40-character
hexadecimal commits. The workflow never evaluates arbitrary shell input as
a command.

`scripts/c39/compare-profiles.mjs` reads actual browser log reports. For
each run, it rejects incomplete/duplicate reports and enforces the same
scenario, fixture media, browser version, OS/architecture and reported
commit SHA. It computes chronological paired deltas for active-wheel p95,
maximum frame gap, and >50/>100 ms frame rates, alongside raw observations.
The comparison produces a retained JSON artifact and logs for all runs.

A minimum of five pairs is required. The report explicitly states whether
each arm contained at least 200 active-wheel frame observations; if fewer,
the sample is **insufficient for p99/tail acceptance** even when the
comparison workflow itself succeeds. No hardware-independent frame-time
threshold is introduced into CI, because shared GitHub runners are noisy.

## Run instructions

GitHub Actions → **C3.9-E1 paired browser comparison** → Run workflow.
Select the post-merge branch/ref containing this workflow; keep the pinned
baseline and choose the candidate SHA. Start with `3000-cold-mixed`
and five ABBA cycles; repeat for `5000-heavy-mixed` and then eight
cycles as required to obtain enough active samples.

Review `c39-e1-results/comparison.json` and each raw log before making
performance claims. An aborted run produces only partial artifacts; it must
never be described as a successful comparison.

## Scope and following work

This block adds benchmark orchestration, comparison and regression tests only.
It does **not** change production reducers, security validation, BoardDocument
schemas, media isolation, server sync, rendering, or permissions.

The workflow is `workflow_dispatch`-only and becomes available on GitHub
after it is merged into the repository's default branch. PR quality gates
cover its JavaScript comparator tests. Actual A/B/A performance conclusions
require completed workflow runs and independent repeats.

Next C3.9-E block: obtain paired results, then investigate the remaining
single full-input-validation cost and compositor stall separately. Preserve
the trusted/untrusted document boundary before proposing a production
fast path. Continue visual/hit/DPR parity and 48-cycle media lifecycle
checks before sign-off. C3.9-F still owns multi-hour teacher/guest soak.
