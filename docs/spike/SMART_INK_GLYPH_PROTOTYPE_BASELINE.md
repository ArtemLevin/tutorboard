# SI-G04A — Smart Ink 2.0 experimental glyph prototype classifier

## Status and safety boundary

This is a reproducible **baseline algorithm and training/evaluation tool**, not
a calibrated production recognizer. No reviewed multiwriter glyph corpus is
committed yet. **Do not claim letter/digit accuracy or enable glyph autoconvert
from this PR.** Smart Ink 2.0 geometric recognition and BoardDocument are unchanged.

Implementation:
- `src/modules/smart-ink/v2/glyph-prototype.ts`: bounded 12×12 raster
  descriptor with normalized geometry, aspect ratio and stroke-count features.
  Deterministic nearest-centroid model trained from labelled examples.
- `scripts/train-smart-ink-glyph-prototype.mjs`: offline CLI train,
  validate author/device-disjoint calibration and holdout, report measurements,
  emit model artifact.
- `tests/unit/modules/smart-ink-v2/glyph-prototype.test.ts`: features,
  model validation, candidate ranking, malformed input, cancellation.

An individual sample is a **group of one or more pen strokes**. The feature
extractor handles stationary points and normalizes translation and uniform
scale, while retaining relative proportions. The algorithm is intentionally
simple; it forms an explicit reproducible reference before a learned
sequence/vision model is evaluated. The current descriptor loses some stroke
order and handwriting detail. Multi-script homographs remain inherently
ambiguous.

## Offline experiment

Use the SI-G03 capture tool to collect human examples and independently review
labels. Build disjoint corpus partitions with:

```sh
node scripts/build-smart-ink-glyph-splits.mjs \
  --input tests/fixtures/smart-ink-glyph-corpus/local/reviewed.json \
  --out-prefix tests/fixtures/smart-ink-glyph-corpus/local/experiment
```

Train and evaluate:

```sh
node scripts/train-smart-ink-glyph-prototype.mjs \
  --train tests/fixtures/smart-ink-glyph-corpus/local/experiment.train.json \
  --calibration tests/fixtures/smart-ink-glyph-corpus/local/experiment.calibration.json \
  --holdout tests/fixtures/smart-ink-glyph-corpus/local/experiment.holdout.json \
  --model tests/fixtures/smart-ink-glyph-corpus/local/prototype.model.json \
  --report tests/fixtures/smart-ink-glyph-corpus/local/prototype.report.json
```

No outputs overwrite existing files. The CLI fails closed if inputs are
unreviewed, sample IDs duplicate or authors/devices overlap between partitions,
or if there are too few training classes. The artifact contains **class means
and counts only**, and omits raw pen trajectories and writer IDs. The report
records per-script top-1/top-3 accuracy, per-class confusion, coverage and
nearest distances for negatives. It deliberately leaves `falseAcceptanceRate`
null because no acceptance policy is calibrated.

**Important:** Distances are NOT calibrated confidence or probability. All
results have `status: "uncalibrated"`; the provider returns
`{script, character, distance}` without `probability`, so it cannot be
directly passed to `resolveSmartInkUnifiedDecision` for auto-acceptance.

The experimental provider is asynchronous at the interface boundary and checks
AbortSignal before and after scoring. The current computation is synchronous
and should be called outside frame-sensitive rendering; SI-G04B will add a
worker-backed production candidate model after representative measurements.
The library is bounded at 12 strokes, 4,096 points per stroke, 16,384 total,
2,000 training samples and 177 classes. Artifacts must pass strict parsing.

## Remaining release gates

1. Obtain consented, pseudonymized, **independently reviewed** data by
   diverse authors and devices; verify 177-class coverage and difficult pairs.
2. Compare this baseline with a stroke-sequence learner and raster recognizer
   on the same writer/device-separated holdout.
3. Calibrate open-set rejection against shape and ordinary-ink negatives.
4. Introduce a versioned calibrated model with real confidence bounds and
   an explicit model validation gate. Only then make glyph results available
   as `SmartInkGlyphEvidence: ready` in the unified arbiter.
5. Integrate asynchronous glyph sessions with the canvas, text replacement,
   collaborative undo/reconnect and Chromium/Firefox regression gates.

See `docs/plans/SMART_INK_MULTILINGUAL_GLYPHS.md` for the full roadmap.
