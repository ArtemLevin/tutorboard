# Smart Ink external-human calibration evidence

This directory contains a deterministic, pseudonymized sample derived from two
CC BY 4.0 datasets:

- The Quick, Draw! Dataset, Google LLC:
  <https://github.com/googlecreativelab/quickdraw-dataset>
- Hand-drawn Shapes Dataset © 2022 Francois Robert:
  <https://github.com/frobertpixto/hand-drawn-shapes-dataset>

The source trajectories and raster contours remain subject to their respective
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) attribution
requirements. TutorBoard importer and calibration code remains subject to the
repository's own license.

`manifest.json` pins the HDS commit, Quick, Draw! object fingerprints, import
configuration, sample counts and SHA-256 for every generated artifact. Raw
Quick, Draw! identifiers and HDS participant names are absent. HDS participant
groups and per-drawing Quick, Draw! groups use truncated SHA-256 identifiers.
The committed corpora use deterministic gzip (`gzip -n -9`) to keep the Git
payload compact; the calibration CLI accepts plain JSON and `.json.gz`.

Changes from the attributed sources:

- Quick, Draw! was filtered to recognized one-stroke records, sampled with a
  deterministic reservoir and stripped of source IDs and non-stroke fields;
- HDS PNGs were deterministically sampled, converted to 128-point dominant
  raster contours and stripped of filenames and participant names;
- the calibration report contains aggregate metrics and source-group counts
  without stroke points.

## Reproduction

Generate the Quick, Draw! sample:

```bash
npm run smart-ink:corpus:quickdraw -- \
  --official line \
  --official circle \
  --official square \
  --official triangle \
  --official negative=squiggle \
  --official negative=zigzag \
  --official negative=star \
  --max-per-input 80 \
  --seed 90210 \
  --output quickdraw.seed-90210.json
gzip -n -9 quickdraw.seed-90210.json
```

Check out HDS commit
`a01f80248c156c56a83b2678453e410bdcc6a342`, then generate its sample:

```bash
npm run smart-ink:corpus:hds -- \
  --root /path/to/hand-drawn-shapes-dataset/data \
  --max-per-kind 80 \
  --seed 90210 \
  --output hds.seed-90210.json
gzip -n -9 hds.seed-90210.json
```

Run calibration:

```bash
npm run smart-ink:calibrate -- \
  --input quickdraw.seed-90210.json.gz \
  --input hds.seed-90210.json.gz \
  --seed 90210 \
  --calibration-ratio 0.7 \
  --output calibration-report.seed-90210.json
```

The committed baseline is eligible by corpus quota and fails the quality gate.
The selected options are `minimumConfidence=0.60` and
`ambiguityMargin=0.20`; holdout macro precision is `0.547619` and the
false-positive rate is `0.104167`.

This holdout has been observed and is now development evidence. A recognizer
revision must use a newly sampled, disjoint final holdout before any gate can
be declared passed.
