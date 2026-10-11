# C3.9-S6.3-B — Attribution of first viewport ownership and remaining frame stalls

**Date:** 2026-10-11  
**Issue:** [#201](https://github.com/ArtemLevin/tutorboard/issues/201)  
**Draft PR:** [#230](https://github.com/ArtemLevin/tutorboard/pull/230), stacked on experimental #229 → #228 → #227 → #226 (main unchanged)  
**Measured code SHA:** `42ee0bbfab40bdfc2cb123bcc856861566f85238`

## Question and change

S6.3 eliminated ~88–90% of the repeated whole-document validation work,
yet its 10k-ink active frame p95 did not improve. Two competing causes were
still unresolved: first-command creation of an independently validated,
deeply frozen document, and continued drawing/hit-canvas work.

This **attribution-only experiment** adds opt-in, bounded C39 trace events:

- `viewport-owned.schema-parse`: Zod `boardDocumentSchema.safeParse`
  (includes independent deep reconstruction of the parsed document);
- `viewport-owned.invariants`: semantic checks after a successful parse;
- `viewport-owned.freeze`: recursive freeze of the trusted parsed tree;
- `viewport-owned.first-commit`: union interval from first identity miss
  through parsing and freeze; **overlaps all three spans above**;
- `viewport-owned.cache-hit`: counts reuse of an already owned document.

The production path without a C39 trace sink still uses the same validator,
same freezing algorithm and same permission checks; no stored schema, network
contract or undo/redo changes. Unit regressions verify exactly one event for
each first-commit subphase and nine owned reuse events across ten consecutive
viewport commands on a 3000-stroke document.

## Browser workload and checks

[Independent two-runner Chromium DPR2 profile #38159192793](https://github.com/ArtemLevin/tutorboard/actions/runs/38159192793):
**SUCCESS**, 2 independent GitHub runners, 2 repetitions per runner of
5k/10k varied real pen strokes + 4 PNG + 6 JPEG, 18 native wheel inputs in
each case. Each sample uses a fresh browser context and real IndexedDB
document restore. Eight test cases in total.

[CI #38159192819](https://github.com/ArtemLevin/tutorboard/actions/runs/38159192819):
main quality gate passed, including formatting, lint, typecheck, full unit
suite, performance budgets, architecture and production build; separate
browser/production gates are checked independently.

All times below are synchronous main-thread trace spans in milliseconds,
rounded to the nearest millisecond.

| Runner | Repeat | Ink strokes | Active rAF p95 | Schema parse | Invariants | Deep freeze | First commit total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| A | 1 | 5000 | 233 | 76 | 25 | 37 | 137 |
| A | 2 | 5000 | 267 | 75 | 23 | 36 | 134 |
| B | 1 | 5000 | 167 | 68 | 14 | 43 | 126 |
| B | 2 | 5000 | 117 | 65 | 20 | 26 | 111 |
| A | 1 | 10000 | 400 | 143 | 43 | 95 | 280 |
| A | 2 | 10000 | 400 | 149 | 41 | 97 | 287 |
| B | 1 | 10000 | 267 | 131 | 37 | 59 | 226 |
| B | 2 | 10000 | 250 | 119 | 33 | 66 | 218 |

Across the four independent measurements of each size:

| Load | First commit range | Median first | Parse range | Freeze range |
| --- | ---: | ---: | ---: | ---: |
| 5000 | 111–137 ms | 130 ms | 65–76 ms | 26–43 ms |
| 10000 | 218–287 ms | 253 ms | 119–149 ms | 59–97 ms |

Synchronous preparation is substantial and occurs **during** the observed
wheel input phase. During these runs it intersected one or two recorded rAF
frame gaps per scenario. Most other long frames remained independent of that
single first-commit interval: at 10k, the sample had 18–42 gaps above 100ms;
one or two overlapped first-commit work. Consequently, relocating or
optimizing the first clone/freeze may improve the initial zoom response, but
is unlikely to solve sustained 10k viewport p95 on its own.

The `viewport-scene-select` traces showed first content-reference
rebuild costs of roughly **2–6ms** per 5k/10k trial and negligible duration on
subsequent viewport-only reuse. React/Konva/Chromium slow-frame correlation
contains many `konva-scene` and `konva-hit` records as well as
`LayerTreeHost::DoUpdateLayers` / compositor scheduling. These events are
**coincident evidence, not a proof of exclusive frame causality**.

**Never sum** the aggregate first-commit duration with parse, invariants or
freeze: they are nested intervals. The measured first commit excludes the
metadata check and dispatch that follow it. Browser rAF frame gaps are
independent end-to-end measurements, and event logs do not establish precise
GPU execution time.

## Release decision

**S6.3-B attribution GO; production large-board performance still NO-GO.**
Instrumentation precisely separated the one-off ownership cost and showed
many remaining slow frames outside the ownership phase. PR #230 stays Draft.
No merge to main and no claim of ≥20% p95 improvement.

A speculative removal of the validation or deep freeze is rejected: the
trusted session must own an independent immutable document, while external
or invalid documents must continue to be checked by public reducer APIs.

## Next bounded implementation target

The next root-cause engineering step is **render/hit-pass isolation under
viewport gestures (C3.9-S7)**: inspect the Konva layer draw scheduling and
stage hit-canvas invalidation in the actual static-heavy scene; identify
avoidable repeated scene/hit redraws when only the viewport changes; add
a reversible, explicit active-wheel cache or suppression path only after
confirming correctness of pointer hit tests and full redraw at wheel-end.
Preserve arbitrary z-order, image/GIF lifecycle, precision eraser,
selection/transform, collaboration and undo/redo.

Use a paired two-runner 5k/10k DPR2 ABBA test with the same true PNG/JPEG
inputs, quantitative >100ms frame counts, end-to-end `active p95 >=20%` gate,
and equivalent hit maps before accepting the change. The Worker snapshot
provenance issue in S6.4-B remains a separate data-integrity release blocker.
