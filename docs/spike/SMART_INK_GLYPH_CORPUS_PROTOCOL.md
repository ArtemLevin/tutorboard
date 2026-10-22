# Smart Ink 2.0 — multilingual glyph corpus protocol (SI-G03)

## Scope and status

The SI-G03 capture tool provides **human-authored, multi-stroke** data for
Cyrillic, Latin, Greek and Arabic digits. This is a research-data foundation.
**No classifier is trained or enabled by SI-G03.** Geometry remains the active
Smart Ink behavior until SI-G04–SI-G06 provide model evidence and canvas integration.

## Capture page

With TutorBoard running through `npm run dev` or `npm run build && npm run preview`,
open:

`/tools/smart-ink-glyph-corpus-capture.html`

The page is bundled as a separate HTML entry and does not open a BoardDocument.
It does not upload traces or call a remote recognizer.

1. Keep the same **anonymous writer code** for one author across all sessions.
2. Keep the same **anonymous device code** for one physical device across all sessions.
3. Select a script and a target glyph; the prompt shows its Unicode code point.
4. Draw one symbol with as many natural strokes as needed (up to 12).
5. Choose **Добавить пример**; use **Следующий символ** for the next character.
6. Capture shapes/ordinary ink as hard negatives as well as the 177 glyph classes.
7. Export JSON. Optionally import a prior corpus; imports validate completely and
   reject duplicates before merging, preserving the original corpus on failure.

For each sample the client records a pseudonymous writer/device code, general
browser/device profile, pointer type, Unicode target, pressure, monotonic relative
time and 2D coordinates. It intentionally omits precise timestamps, IP,
user-agent strings, usernames, lessons, board content and personally identifying
student fields. Export contains only the strokes drawn on the capture surface.

Capturing another person's handwriting requires consent. Do not commit raw
student data into the public repository. All newly captured samples carry
`labelStatus: "unreviewed"`; independently check labels and provenance
before changing them to `reviewed`. This is an explicit offline review step.
Self-labelled samples must never silently count as audited ground truth.

## Format and limits

Schema: `tutorboard.smart-ink-glyph-corpus/1`.

`target` is either:
- `{ kind:"glyph", script:"Cyrl"|"Latn"|"Grek"|"Zyyy", character:"…" }`;
- `{ kind:"shape", shape:"line"|"circle"|"ellipse"|"rectangle"|"square"|"triangle"|"arrow" }`;
- `{ kind:"ordinary-ink" }`.

Alphabet: 66 Cyrillic characters including Ё/ё; 52 Latin; 49 Greek including
final sigma (ς); ten digits, **177 character classes** in total.
Alternative Greek letter forms, superscripts and punctuation require future
explicit taxonomy decisions.

Strict runtime validation forbids unknown properties and unbounded input:
2,000 samples per file, 12 strokes per sample, 4,096 points per stroke,
16,384 total points, 300 s maximum relative duration, finite bounded
coordinates/pressure and monotonic point timestamps. The client limits imports
to 8 MB. Invalid or duplicate imports are rejected as a whole.

## Dataset evaluation and disjointness

Check a corpus:

```bash
node scripts/build-smart-ink-glyph-splits.mjs --input path/to/corpus.json
```

After **independent label review**, write deterministic splits:

```bash
node scripts/build-smart-ink-glyph-splits.mjs \
  --input path/to/reviewed.json \
  --out-prefix path/to/smart-ink-glyphs
```

Outputs are `.train.json`, `.calibration.json`, `.holdout.json` and summary
counts. Splits are disjoint by **connected components of writer and device
codes**. Fewer than three independent components, or any `unreviewed` sample,
fails closed. Split manifest reports per-class coverage; publishing model
metrics requires coverage quotas and sufficient independent writers per class.

Pseudonymous codes are supplied by the operator, so genuine cross-session
disjointness depends on consistently reusing them. Different device codes
for the same physical device undermine the guarantee. The CLI does not
claim independent evaluation quality from a small or unbalanced corpus.

Do not report classifier accuracy before model training and independent testing.
The current geometric corpus and zero-negative auto-accept regression remain
mandatory unchanged.

## Suggested sampling matrix

Collect characters from diverse writers and devices, with both quick and
carefully drawn glyphs; prioritize confusing pairs (`О/O/Ο/0`,
`р/p/ρ`, `х/x/χ`, `Δ/triangle`, `1/line`).
Include delayed dots/diacritics, single-point marks, rotated/scaled symbols,
strokes near geometrical figures and intentional scribbles.

A provisional development target is 40 samples per class, **subject to
independent holdout and review**. Do not interpret that target as sufficient
statistical evidence of production precision.
