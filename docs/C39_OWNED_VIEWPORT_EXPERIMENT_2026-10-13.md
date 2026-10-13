# C3.9 — session-owned viewport experiment

Date: 13.10.2026 · Issue [#201](https://github.com/ArtemLevin/tutorboard/issues/201).
Parent PR [#253](https://github.com/ArtemLevin/tutorboard/pull/253): verified
phase attribution. This PR remains a **Draft performance candidate**.

## Ownership contract

`createOwnedViewportReducer` is a controller-scoped reducer for interactive
`core.viewport.set` only. An unknown document always undergoes full
`validateBoardDocument` (Zod deep parse and semantic checks), then the parsed
independent copy is recursively frozen. Neither the original imported document
nor the incoming command payload is frozen. The latest internally returned
frozen document identity is the *sole* trusted source for the fast path.

The session rejects malformed external documents, checks metadata and changed
viewport using existing reducer helpers, preserves canonical bytes/timestamps/
error codes, and shares unchanged content on subsequent viewport commits.
Any root identity switch (including undo/redo, collaboration hydration,
external replacement and content command) forces full validation. Controller
resets ownership on hydration, undo/redo and non-viewport/batch mutations.
Explicit reset releases its retained large graph.

Public `reduceBoardDocument` retains mandatory input validation, and server
trust boundaries, persistence/serialization, permissions and WS contracts
are unchanged. No Worker provenance cache from earlier stacked PR #228 is
included.

## Measurement and release gate

Phase traces from #253 now distinguish `viewport-owned-parse`,
`viewport-owned-freeze`, `viewport-owned-reuse` and `viewport-apply`.
Avoid adding overlapping spans; the first parse/freeze remains synchronous
on the first wheel gesture and **may cause latency/memory regressions**.

Earlier PR #229 had approximately 88–90% lower repeated full-validation time
but did **not** satisfy the browser 20% p95 threshold; its 10k p95 regressed.
This isolated reimplementation is not automatically a proven improvement.

Required: focused and full CI, 3k/5k/10k Chromium paired ABBA on independent
runners with 10 PNG/JPEG images and DPR2, fixed source SHA/fixture/equal camera
path and screenshot parity, pen/hit testing, undo/redo, reconnect/revoke and
memory/soak. Declare performance GO only on >=20% active-p95 speedup at both
5k and 10k on each runner with no tail or fidelity regression. Otherwise keep
the experiment Draft, preserve Issue #201, and isolate expensive first
parse/freeze before another candidate.

## Reproducible paired gate

`.github/workflows/c39-owned-viewport-abba.yml` runs identical production
builds from immutable control/candidate SHAs in isolated worktrees on two
independent Ubuntu runners. Each runner performs two chronological ABBA cycles
(4 same-machine pairs per scene) at 5k and 10k + 4 PNG/6 JPEG, DPR2, 18 wheel
inputs. The comparison script refuses missing results, different source SHAs,
fixture media, browser versions and rendered scene/layer state. It records all
paired changes in active P95 and >100 ms frame rate without dropping samples.
The 20% speedup threshold and no >100 ms rate regression must hold per runner.
This initial gate does not by itself prove pixel-hash equality or memory safety.
