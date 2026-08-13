# Smart Ink captured Chromium development evidence

This directory records the first TutorBoard browser-captured corpus for
`Semantic Ink`. It contains 241 strokes drawn by one person with a pen on a
Windows laptop in Chrome/Chromium:

- 21 lines;
- 22 circles;
- 31 ellipses;
- 23 rectangles;
- 23 squares;
- 22 triangles;
- 99 negative strokes.

The corpus passed the `tutorboard.smart-ink-corpus/0.1` runtime boundary. Every
sample has a unique identifier and bounded coordinates, point count and
duration. Its metadata uses only the protocol's coarse browser, device and
pointer categories.

This corpus is observed development evidence. It was evaluated with frozen
options `minimumConfidence=0.34`, `ambiguityMargin=0.04` and `sampleCount=96`.
Recognizer v3 produced:

- macro precision `0.94098`;
- macro recall `0.952591`;
- false-positive rate `0.040404`;
- specialized top-2 accuracy `1`;
- positive unrecognized rate `0.021127`.

The four false positives were open partial polygons and a concave
self-intersecting loop. Recognizer v4 adds targeted validity penalties for
these two patterns. On the same observed development corpus it produces:

- macro precision `0.964372`;
- macro recall `0.952591`;
- false-positive rate `0`;
- specialized top-2 accuracy `1`;
- positive unrecognized rate `0.021127`.

The independent external v2 positive regression and v3 negative holdout remain
historical evidence. Recognizer v5 makes ambiguity family-aware and counts only
automatic acceptance as a prediction. On this corpus it produces:

- macro precision `0.992754`;
- macro recall `0.952591`;
- ambiguity rate `0.016598`;
- false-positive rate `0`;
- positive unrecognized rate `0.021127`.

Firefox capture stays as a separate future platform validation.
This directory therefore records Chromium development progress and does not
close the production gate.
