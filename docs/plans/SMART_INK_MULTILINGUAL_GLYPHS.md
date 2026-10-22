# Smart Ink 2.0 — multilingual glyph expansion (SI-G01 + SI-G02)

Status: foundation implementation on branch `feat/smart-ink-unified-glyph-foundation-20261022`.
Baseline: `main` at `baf31b69835d7a1c5bcc7e15279d41b16e078a0c`.

## Product contract

One **drawing.smart-ink** tool must eventually distinguish:
- Existing geometric primitives and composites.
- Handwritten Cyrillic, Latin, Greek letters and digits.
- Ordinary ink, which is preserved when recognition is unsupported or uncertain.

Glyph recognition will need both isolated characters and multiple strokes per
character. User input remains editable through existing `drawing.text` objects;
source pen strokes must remain recoverable through undo. No BoardDocument schema
migration is needed for isolated character replacement.

**Current increment does not contain a trained glyph model or a glyph canvas
replacement workflow.** It introduces tested pure recognition/session boundaries
and routes existing geometry through the new arbitration entrypoint in
`disabled` mode. Production behavior must remain identical to the V2 baseline.

## SI-G01: Unified decision contract

`src/modules/smart-ink/v2/unified.ts` owns discriminated shape/glyph
candidates. It receives the existing Smart Ink V2 geometry decision and one of
three glyph evidence states:
- `disabled`: use the existing production geometric decision.
- `pending`: withhold any automatic replacement until inference settles.
- `ready`: resolve the supplied calibrated glyph candidates.

An auto-accepted shape always requires an accepted geometric candidate from
V2; the legacy fitter cannot override V2 abstention. Glyphs have exact Unicode
and script validation (Cyrl/Latn/Grek/Zyyy digits). Unrecognized Unicode,
malformed probability and unsupported characters cannot be accepted.

When a credible glyph conflicts with a recognized geometric primitive,
the outcome is `ambiguous`: no replacement. A credible Greek/Cyrillic/Latin
character can be accepted if geometric recognition abstains and calibrated glyph
evidence meets the configured threshold and ambiguity margin.

**Before activation, probabilities from a glyph provider must be calibrated**
on writer/device-disjoint data. The current shape-score heuristic and future
glyph scores are not guaranteed to be on a shared probability scale. Do not
reduce the abstention thresholds to manufacture recall.

## SI-G02: Multi-stroke buffer

`src/modules/smart-ink/v2/glyph-session.ts` implements a pure and bounded
session transition that retains every accepted stroke:

- Append new pen strokes (with monotonic `endedAtMs` and world points).
- Continue the pending group when spatial and temporal bounds allow.
- On a distant/late stroke or capacity overflow, emit the previous group
  while retaining the new stroke.
- Explicitly flush on tool change, clear, shutdown or cancellation policy.
- Expire a group after the inactivity window.

Default *provisional* thresholds are 900 ms, 12 strokes, 4,096 points per
stroke and 16,384 points per group. These are subject to human corpus tuning;
dots and separated marks require particular attention. The caller owns timers
and the persistence of finalized groups. A pure module never installs timers,
mutates BoardDocument or starts a network request.

A future canvas controller must pass all incoming strokes through this buffer
*before* committing shape/glyph recognition, and must atomically materialize
accepted replacements with `core.objects.replace`. Stale async results must
check object snapshots and session/generation IDs. **Do not call the geometric
replacement path early while glyph recognition is pending.**

## Next blocks

1. **SI-G03** — annotated handwriting corpus; Cyrillic/Latin/Greek/digit
   distribution, difficult pairs, detached diacritics, shape negatives,
   writer/device-separated holdout and reproducible metrics.
2. **SI-G04** — browser-friendly glyph recognizer or controlled sidecar;
   bounded, cancellable provider port; real model and calibrated confidence.
3. **SI-G05** — evaluate unified recognition on mixed shape/glyph holdouts;
   tune open-set abstention and confusion handling; preserve existing positive
   geometry floors and zero negatives on captured Chromium baseline.
4. **SI-G06** — integrate buffered inference into `useBoardDrawingController`,
   keep current source strokes and commit validated `drawing.text` atomically;
   optional candidate chooser for ambiguous classes.
5. **SI-G07** — collaborative undo/redo, reconnect, lock/read-only, persistence
   and Unicode SVG/PNG/PDF parity with browser-level regression coverage.
6. **SI-G08** — segmentation and composition of neighboring glyphs into
   words/numbers while preserving the choice of script.
7. **SI-G09** — production performance, model-size/resource constraints,
   security review and Chromium/Firefox release gate.

## Verification

First-increment tests are:
- `tests/unit/modules/smart-ink-v2/unified.test.ts`
- `tests/unit/modules/smart-ink-v2/glyph-session.test.ts`
- unchanged shape compatibility tests and production Smart Ink gate.

Release must pass `npm run check` and existing geometric positive/negative
holdouts. Model accuracy and recognition runtime quality cannot be claimed
until SI-G03–SI-G05 are completed and measured.

## SI-G03 — Capture tooling (2026-10-22)

Implementation: `tools/smart-ink-glyph-corpus-capture.html` backed by
`tools/smart-ink-glyph-corpus.mjs`. Independent capture entry is available
through Vite dev/preview. Multi-stroke input captures Unicode targets, script,
pressure and monotonic relative timestamps. Strict validator and deterministic
writer/device-connected split builder refuse unreviewed records and insufficient
groups. See [corpus protocol](../spike/SMART_INK_GLYPH_CORPUS_PROTOCOL.md).

Actual capture from multiple consenting writers and independent label review
remain operational tasks. SI-G04 model selection/training remains open; there is
no glyph auto-correction until model and mixed arbitration gates pass.
