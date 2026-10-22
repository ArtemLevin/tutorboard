# SI-G05A — experimental glyph open-set evaluation

## Scope

Smart Ink V2's existing geometric recognition remains unchanged. The
multilingual glyph baseline trained in SI-G04A returns **un-calibrated nearest
prototype distances**. SI-G05A adds a reproducible *research-only* distance
rejection experiment to measure the tradeoff between symbol coverage and
dangerous false replacements on ordinary ink and geometric negatives.

Implementation:
- `src/modules/smart-ink/v2/glyph-open-set.ts`
- `scripts/train-smart-ink-glyph-prototype.mjs`
- `tests/unit/modules/smart-ink-v2/glyph-open-set.test.ts`
- `tests/node/smart-ink-glyph-prototype-cli.test.mjs`

## Calibration and independent evaluation

1. Collect independently reviewed Cyrillic, Latin, Greek and digit samples,
   plus **shape** and **ordinary-ink** negatives. Keep writer and device
   identities disjoint across train, calibration and holdout (SI-G03 contract).
2. Train the existing experimental nearest-centroid model only on glyphs from
   the train partition; retain negatives exclusively for evaluation.
3. Produce sorted top-3 candidates for calibration examples.
4. Compute a *strict* rejection distance cutoff at the **smallest top-1
   distance of a calibration negative or incorrectly classified glyph**.
   Strict `distance < cutoff` means those calibration failures abstain. If
   calibration has no negatives, no usable wrong predictions, or the cutoff
   collapses to zero, it becomes `null` and every example abstains. Tied
   top-2 distances also abstain to avoid homograph guessing.
5. Apply the unchanged cutoff to held-out examples. Report accepted correct
   and incorrect glyphs, accepted negatives, discarded examples, glyph
   coverage, accepted precision, false-acceptance rates and one-sided
   Wilson-95% upper bounds for negative and wrong-glyph acceptance.
6. Keep the entire result **research-only** regardless of how favorable
   calibration or holdout metrics appear: reports include
   `experimentalOpenSet.runtimeAllowed: false` and the `status:
   "research-only"` policy. No conversion to
   `SmartInkGlyphEvidence: ready` exists.

The upper bound must be read alongside actual sample counts. For example,
zero false accepts on ten negatives is extremely weak evidence. The
observed calibration zero-error result is **in-sample by construction**;
only independently held-out rates have predictive value.

## Run

```bash
node scripts/train-smart-ink-glyph-prototype.mjs \
  --train local/experiment.train.json \
  --calibration local/experiment.calibration.json \
  --holdout local/experiment.holdout.json \
  --model local/glyph-prototype.model.json \
  --report local/glyph-prototype.report.json
```

New section in the report:

```json
{
  "experimentalOpenSet": {
    "gate": {
      "status": "research-only",
      "maximumDistanceExclusive": null
    },
    "calibration": {
      "negativeFalseAcceptanceUpper95": null
    },
    "holdout": {
      "acceptedWrongGlyphs": 0,
      "negativeFalseAcceptanceRate": null
    },
    "runtimeAllowed": false
  }
}
```

The above JSON is a **shape illustration**, with null values for missing
evidence. Do not treat them as measured production metrics.

## Remaining release requirements

- Obtain real consented, independently reviewed multiwriter corpora with
  statistically meaningful representation of all three scripts, digits,
  negatives, and confusing pairs.
- Compare stronger models on the *same frozen holdout*, e.g. a learned
  stroke-sequence model versus a compact raster classifier. The current
  centroid baseline is only a reference.
- Choose and calibrate a **production** acceptance policy using an independent
  calibration set, then re-evaluate a still-unseen final holdout. Build
  browser latency and memory budgets into the release gate.
- Add a separately versioned production-quality and authorization contract
  before any glyph acceptance and automatic `drawing.text` replacement.
  SI-G06 will handle the canvas integration, stale-state validation,
  collaborative undo and reconnect.

The glyph model and this evaluation code do not modify the real-time canvas,
BoardDocument schema, or the existing Smart Ink geometric recognizer.
