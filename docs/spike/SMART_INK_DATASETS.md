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
- verifies three triangle vertices or four ellipse/rectangle vertices;
- uses the raster only for the contour and never substitutes labelled ideal
  vertices;
- rejects low-contrast, fragmented or degenerate images;
- hashes file and participant identities;
- maps HDS `other` to `negative`;
- records `sourceDataset=hds` and `traceOrigin=raster-contour`;
- creates a new output file and refuses to overwrite an existing one.

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
