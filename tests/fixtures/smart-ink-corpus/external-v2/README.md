# Smart Ink recognizer v2 independent holdout

This directory records the first independent evaluation of
`tutorboard.smart-ink-geometric/0.2-spike`.

The holdout contains 360 external-human samples:

- 40 samples for each of the six supported primitives;
- 120 Quick, Draw! trajectory negatives;
- 257 pseudonymized source groups;
- zero sample or source-group overlap with the seed-90210 development corpus.

Quick, Draw! and HDS remain subject to the attribution terms documented in
`../external/README.md`. The HDS portion contains `ellipse`, `rectangle` and
`triangle` contours from participants absent from development. HDS `other` is
excluded because reducing a composite raster to one dominant contour can
discard the semantic context that made the source image negative.

The recognizer thresholds were frozen on development before this holdout was
evaluated:

- `minimumConfidence=0.34`;
- `ambiguityMargin=0.04`;
- `sampleCount=96`.

The holdout passes macro precision, specialized top-2, unrecognized-rate and
latency objectives. It records four false positives among 120 negatives, so
FPR is `0.033333` and the calibration gate remains closed.

This holdout is now observed development evidence. Future negative rejection
changes require a new disjoint negative confirmation set. The Chromium and
Firefox capture requirement remains the separate production gate.

Recognizer v3 uses this observed corpus only for regression. Its independent
negative confirmation is recorded in `../external-v3/`.
