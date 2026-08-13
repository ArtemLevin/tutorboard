# Smart Ink recognizer v5 regression and negative confirmation

This directory records the independent false-positive confirmation for
`tutorboard.smart-ink-geometric/0.5-spike`. Historical v3 reports remain in
the directory for auditability and are not referenced by the current manifest.

The recognizer and thresholds were frozen before seed `260730` was evaluated.
The negative holdout contains 240 external-human Quick, Draw! trajectories:

- 80 `squiggle`;
- 80 `star`;
- 80 `zigzag`;
- 240 pseudonymized source groups;
- zero sample or source-group overlap with the seed-90210 development corpus
  and the observed seed-170731 v2 holdout.

The frozen options remain:

- `minimumConfidence=0.34`;
- `ambiguityMargin=0.04`;
- `sampleCount=96`.

One trajectory is geometrically indistinguishable from a line and receives a
line proposal. The independent false-positive rate is therefore `0.004167`,
below the `0.02` target.

`v2-regression-report.v5.seed-170731.json` re-evaluates the already observed v2
holdout with family-aware ambiguity and honest acceptance metrics. It records
macro precision `0.988328`, macro recall `0.933333`, ambiguity `0.016667` and
false-positive rate `0.008333`. This report is regression evidence; only the
seed-260730 negative holdout is independent evidence.

Quick, Draw! remains subject to the attribution terms documented in
`../external/README.md`. The Chromium and Firefox captured-corpus requirement
remains the separate production gate.
