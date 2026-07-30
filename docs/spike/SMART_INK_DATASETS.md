# Smart Ink external datasets and humanized approximations

## Decision

Phase 9 uses three evidence tiers and never silently promotes one tier into
another:

1. `captured` — a person drew directly in the TutorBoard capture page;
2. `external-human` — a real human drawing imported from an attributed public
   dataset; `traceOrigin` distinguishes a recorded trajectory from a
   reconstructed raster contour;
3. `synthetic` — a deterministic ideal or humanized approximation.

External data may open the calibration gate. It cannot prove browser-specific
pointer behavior, so only `captured` data can open the production gate.

## Dataset assessment

### Quick, Draw!

Use now for `line`, `circle`, `square`, `triangle` and negative examples.

- 50 million drawings in 345 classes from more than 15 million players;
- raw records contain vector strokes and elapsed-time values;
- relevant direct classes: `line`, `circle`, `square`, `triangle`;
- there are no direct `ellipse` or `rectangle` classes;
- license: Creative Commons Attribution 4.0.

Source and attribution:

- <https://github.com/googlecreativelab/quickdraw-dataset>
- The Quick, Draw! Dataset, Google LLC, CC BY 4.0.

The importer deliberately rejects `ellipse` and `rectangle` targets. Affine
stretching of a circle or square is useful synthetic augmentation, but the
result is not a human-labelled ellipse or rectangle.

### Hand-drawn Shapes (HDS)

Experimental second adapter for `rectangle`, `ellipse`, `triangle`, `other`.

- 27,292 hand-drawn 70×70 images;
- shape intent was collected from people aged 7–87;
- vertex coordinates accompany each image;
- classes: rectangle, ellipse, triangle, other;
- license: data under CC BY 4.0, notebooks under MIT.

Source and attribution:

- <https://github.com/frobertpixto/hand-drawn-shapes-dataset>
- Hand-drawn Shapes Dataset © 2022 Francois Robert, CC BY 4.0.

HDS is raster rather than a timestamped trajectory. The experimental adapter
extracts the dominant foreground component, traces the largest closed pixel
boundary and resamples it to 128 ordered points. It validates the companion
vertex CSV but does not use vertices to manufacture an ideal shape. The result
is labelled `traceOrigin=raster-contour`; it is never presented as the original
pen path.

All images from one HDS participant share an anonymized `sourceGroupId`.
Calibration therefore keeps a participant and all pre-generated aspect-ratio
variations entirely in one split.

### $1 Unistroke gesture logs

Potential supplementary source for circle, rectangle and triangle.

- official page publishes XML gesture logs;
- traces are single-stroke and timestamped;
- the page states a New BSD license for the software, but the data-log license
  is not stated separately with enough clarity for automatic redistribution.

Source:

- <https://depts.washington.edu/acelab/proj/dollar/index.html>

Do not vendor the XML logs until redistribution terms for the logs are
confirmed.

## Quick, Draw! import

Download raw, category-separated NDJSON from the official dataset. Do not use
the simplified files because they discard timing.

Example:

```bash
npm run smart-ink:corpus:quickdraw -- \
  --input line=/data/quickdraw/line.ndjson \
  --input circle=/data/quickdraw/circle.ndjson \
  --input square=/data/quickdraw/square.ndjson \
  --input triangle=/data/quickdraw/triangle.ndjson \
  --input negative=/data/quickdraw/squiggle.ndjson \
  --input negative=/data/quickdraw/zigzag.ndjson \
  --max-per-input 40 \
  --seed 90210 \
  --output tests/fixtures/smart-ink-corpus/local/quickdraw.json
```

The same importer can stream a seeded reservoir sample directly from the
official raw dataset without storing the category files:

```bash
npm run smart-ink:corpus:quickdraw -- \
  --official line \
  --official circle \
  --official square \
  --official triangle \
  --official negative=squiggle \
  --official negative=zigzag \
  --max-per-input 40 \
  --seed 90210 \
  --output tests/fixtures/smart-ink-corpus/local/quickdraw.json
```

Official mode uses only a fixed Google Cloud Storage origin and a closed list
of reviewed positive/negative mappings. It enforces the same streamed byte,
line, point, duration and output bounds as local mode.

The importer:

- streams NDJSON instead of loading the dataset into memory;
- uses seeded reservoir sampling over all eligible rows;
- admits only recognized, one-stroke records with raw `x`, `y`, `t`;
- bounds file, line, point, duration, input and output sizes;
- hashes `key_id` instead of preserving the source identifier;
- records `external-human`, `sourceDataset=quickdraw`, unknown pointer and no
  claimed browser;
- records `traceOrigin=recorded-trajectory` and a hashed per-drawing
  `sourceGroupId`;
- records the reviewed public `sourceCategory` so negative confirmation can
  preserve equal `squiggle`, `star` and `zigzag` quotas;
- creates a new output file and refuses to overwrite an existing one.

## HDS contour import

Clone or download the attributed HDS repository outside TutorBoard, then run:

```bash
npm run smart-ink:corpus:hds -- \
  --root /data/hand-drawn-shapes-dataset/data \
  --max-per-kind 80 \
  --seed 90210 \
  --output tests/fixtures/smart-ink-corpus/local/hds.json
```

The importer:

- scans only the documented `user.*/images/<kind>/*.png` layout and skips
  symlinks;
- bounds file count, PNG bytes, dimensions, vertex CSV and corpus size;
- verifies three triangle vertices, tolerating HDS's repeated closing row, or
  four ellipse/rectangle vertices;
- accepts `other` without a companion vertex file, matching the published HDS
  layout;
- uses the raster only for the contour and never substitutes labelled ideal
  vertices;
- rejects low-contrast, fragmented or degenerate images;
- hashes file and participant identities;
- maps explicitly opted-in HDS `other` samples to `negative`;
- records `sourceDataset=hds` and `traceOrigin=raster-contour`;
- creates a new output file and refuses to overwrite an existing one.

Recognizer-v2 evidence changed the default HDS policy. `other` is now excluded:
its label describes the full raster, while dominant-contour reconstruction may
retain only a circle or rectangle from a composite drawing. Pass
`--include-other` only for adapter research. The contour adapter also rejects
outputs with solidity below `0.30` or a contour-to-hull perimeter ratio above
`1.70`.

Use `--exclude-corpus` to remove already observed HDS participant groups before
reservoir selection:

```bash
npm run smart-ink:corpus:hds -- \
  --root /data/hand-drawn-shapes-dataset/data \
  --exclude-corpus tests/fixtures/smart-ink-corpus/external/hds.seed-90210.json.gz \
  --max-per-kind 80 \
  --seed 170731 \
  --output /tmp/hds-independent.json
```

## Automatic confidence calibration

Combine the imported corpora and produce a point-free report:

```bash
npm run smart-ink:calibrate -- \
  --input tests/fixtures/smart-ink-corpus/local/quickdraw.json \
  --input tests/fixtures/smart-ink-corpus/local/hds.json \
  --seed 90210 \
  --calibration-ratio 0.7 \
  --output tests/fixtures/smart-ink-corpus/local/calibration-report.json
```

Calibration inputs may use plain JSON or deterministic `.json.gz`; both
compressed and expanded sizes are bounded.

The calibration pipeline:

1. removes all `synthetic` samples;
2. groups HDS by anonymized participant and Quick, Draw! by drawing;
3. creates a deterministic 70/30 calibration/holdout split with no shared
   groups;
4. scores geometry once and grid-searches `minimumConfidence` and
   `ambiguityMargin` only on the calibration partition;
5. chooses a feasible candidate by precision, false-positive, top-2,
   unrecognized, recall and ambiguity objectives;
6. evaluates the chosen pair once on holdout;
7. writes only aggregate metrics, split counts and selected options.

Pass `--require-pass` when a non-zero exit status is required for automation.
The default quotas remain 40 examples per positive class and 60 negatives.

### Committed baseline

The reproducible evidence snapshot lives in
`tests/fixtures/smart-ink-corpus/external/`. It contains 560 Quick, Draw!
trajectories and 320 HDS contours, plus a source/checksum manifest and a
point-free calibration report.

The seed-90210 run satisfies evidence quotas and finds no feasible quality-gate
candidate. It selects `minimumConfidence=0.60` and
`ambiguityMargin=0.20`; holdout macro precision is `0.547619`, holdout
false-positive rate is `0.104167`, specialized top-2 accuracy is `0.3125` and
the positive unrecognized rate is `0.49697`.

This run is a measured development baseline. Its holdout has been observed.
Recognizer tuning therefore requires a newly sampled, disjoint final holdout
before reporting a gate result.

### Recognizer v2 independent holdout

`tests/fixtures/smart-ink-corpus/external-v2/` records a group-disjoint
seed-170731 holdout generated after recognizer-v2 thresholds were frozen.
Build and evaluate the holdout with:

```bash
npm run smart-ink:holdout:build -- \
  --development tests/fixtures/smart-ink-corpus/external/quickdraw.seed-90210.json.gz \
  --development tests/fixtures/smart-ink-corpus/external/hds.seed-90210.json.gz \
  --candidate /tmp/quickdraw.seed-170731.json \
  --candidate /tmp/hds-independent.seed-170731.json \
  --minimum-per-class 40 \
  --minimum-negatives 120 \
  --seed 170731 \
  --output /tmp/holdout.seed-170731.json

npm run smart-ink:holdout:evaluate -- \
  --input /tmp/holdout.seed-170731.json \
  --minimum-confidence 0.34 \
  --ambiguity-margin 0.04 \
  --sample-count 96 \
  --output /tmp/holdout-report.seed-170731.json
```

The 360-sample holdout has no sample or source-group overlap with development.
It reaches macro precision `0.962123`, macro recall `0.945833`, specialized
top-2 `0.98125`, unrecognized rate `0.033333` and p95 latency `1.090428 ms`.
Four of 120 negatives receive a proposal, so FPR is `0.033333` and the
calibration gate remains closed.

Specialized top-2 is threshold-independent and intent-aware: it checks whether
the ranked pair contains one of the sample's explicitly acceptable
circle/ellipse or square/rectangle interpretations. Unrecognized rate measures
confidence rejection separately.

### Recognizer v3 independent negative confirmation

Recognizer v3 strengthens the shared validity loss for closed primitives:
low hull solidity, inconsistent turning, excessive contour-to-hull length and
insufficient winding reduce every closed-shape candidate consistently. The
confidence thresholds remain frozen at `0.34/0.04`.

Generate a fresh category-labelled candidate pool, exclude all v1/v2 evidence,
build equal quotas and evaluate once:

```bash
npm run smart-ink:corpus:quickdraw -- \
  --official negative=squiggle \
  --official negative=star \
  --official negative=zigzag \
  --max-per-input 90 \
  --seed 260730 \
  --output /tmp/quickdraw-negative-candidates.seed-260730.json

npm run smart-ink:negative-holdout:build -- \
  --development tests/fixtures/smart-ink-corpus/external/quickdraw.seed-90210.json.gz \
  --development tests/fixtures/smart-ink-corpus/external-v2/holdout.seed-170731.json.gz \
  --candidate /tmp/quickdraw-negative-candidates.seed-260730.json \
  --minimum-per-category 80 \
  --seed 260730 \
  --output /tmp/negative-holdout.seed-260730.json

npm run smart-ink:negative-holdout:evaluate -- \
  --input /tmp/negative-holdout.seed-260730.json \
  --minimum-confidence 0.34 \
  --ambiguity-margin 0.04 \
  --sample-count 96 \
  --minimum-negatives 240 \
  --output /tmp/negative-holdout-report.seed-260730.json \
  --require-pass
```

The committed seed-260730 confirmation contains 240 previously unseen
Quick, Draw! trajectories, 80 from each negative category. One near-perfect
line receives a proposal: FPR is `0.004167`, below the `0.02` target.

Re-evaluation of the observed v2 holdout with recognizer v3 preserves macro
precision `0.973757`, macro recall `0.945833`, specialized top-2 `0.98125`
and positive unrecognized rate `0.033333`. The v3 independent result confirms
the FPR objective. Chromium/Firefox capture remains the production gate.

## Humanized geometric generator

`humanizeSmartInkPrimitive` creates deterministic stress data from an intended
primitive. For normalized progress \(s\), the ideal point \(P(s)\) is modified
approximately as

\[
\widetilde P(s)=R_\theta A\left(
P(\phi(s))+
n(s)\sum_{k=1}^{3}a_k\sin(2\pi k s+\psi_k)+
\tau(s)\varepsilon(s)
\right)+b,
\]

where:

- \(A\) adds small anisotropic scale and shear;
- \(R_\theta\) rotates the stroke;
- \(\phi(s)\) warps sampling speed while remaining monotone;
- \(n(s)\) and \(\tau(s)\) are local normal and tangent;
- low-frequency terms model hand drift;
- the fine tangent term models sampling jitter;
- closed shapes vary start point, direction and closure gap;
- \(b\) varies position.

Seeds, point counts and dimensions are bounded. The generator does not use
network calls or nondeterministic time.

Humanized strokes remain `synthetic`. Their jobs are:

- property and robustness tests;
- exploration of recognizer decision boundaries;
- augmentation after distributions are fitted to human data;
- generation of hard negatives near circle/ellipse and square/rectangle.

They must not contribute to calibration precision, false-positive rate or the
production decision.

## Remaining evidence

External data can substantially reduce manual collection, but cannot replace:

- Chromium and Firefox pointer-event sampling;
- mouse versus pen behavior;
- TutorBoard coordinate transforms and coalesced-event policy;
- local drawing intent for rectangle versus square and ellipse versus circle.

Recommended residual capture after public-data calibration: at least ten
examples per class and fifteen negatives in each supported browser, split
between mouse and pen where hardware is available. The current production gate
remains stricter until these smaller quotas are approved from evidence.
