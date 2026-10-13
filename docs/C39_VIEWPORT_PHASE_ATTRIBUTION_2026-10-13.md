# C3.9 — synchronous viewport commit phase attribution (13.10.2026)

Issue: [#201](https://github.com/ArtemLevin/tutorboard/issues/201).
Based on `main` at `69a7577674abab6d31d04b2284723097141a8ff2`. Scope: instrumentation and regression guards; no
candidate performance optimization or production performance claim in this PR.

## Evidence and limitation

The [replicated stable-culling experiment](https://github.com/ArtemLevin/tutorboard/pull/233)
found a 168–225 ms median synchronous `wheel-viewport-persist` span with a
10,000-stroke document, but that marker includes the complete callback chain.
The [owned-reducer experiment](https://github.com/ArtemLevin/tutorboard/pull/229)
reduced full validations significantly while active-frame p95 failed its
5k/10k >=20% acceptance criterion (10k regressed). We cannot yet attribute
all frame-tail delays to the validator alone.

## Recorded phases

The existing opt-in `window.__tutorBoardC37Trace` collector now records:
- `viewport-reducer-total`: synchronous reducer invocation;
- `viewport-validate-current`: full input document Zod + semantics;
- `viewport-validate-command`: command metadata check;
- `viewport-apply`: viewport result schema and timestamp checks;
- `viewport-controller-schedule`: `setState` call (scheduling, not a React commit);
- `viewport-history`: immutable history update during React state processing;
- `viewport-controller-callbacks`: synchronous `onCommandCommitted` callback,
  including its persistence/collaboration enqueue behavior.

The pre-existing `wheel-viewport-persist` remains the end-to-end synchronous
marker. Phases can nest or execute in different turns and **must never be
summed** as independent contributions. Per-frame timestamps allow correlating
each phase with slow-frame intervals. Measurements do not capture compositor
time and contain no document/student payloads.

The browser C3.9 profile saves count, p50, p95 and max per phase in its JSON
attachment. This uses the already bounded, opt-in collector (12,000 events).
With the collector absent, only a cheap branch remains; normal board behavior,
validation and sync protocols are unchanged.

## Exit criteria and next candidate

1. Confirm targeted unit regression, full CI and static-heavy Chromium profiles
   on exact PR SHA. Collect 3k/5k/10k trace-on and trace-off observations.
2. Compare validation, callback and history spans for the same viewport inputs
   on two independent runners.
3. Select the smallest isolated performance candidate from actual dominant
   cause; preserve current-document validation for arbitrary input and avoid
   promoting the unproven S6.3 Worker provenance path.
4. Run paired ABBA on actual browser frames, with document/camera/pixel parity,
   memory and offline/reconnect/undo tests. Require sustained >=20% improvement
   at both 5k and 10k before treating the candidate as a performance GO.

This instrumentation PR does **not** close Issue #201.
