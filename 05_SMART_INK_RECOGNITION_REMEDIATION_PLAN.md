# TutorBoard Smart Ink recognition remediation plan

## Goal

Make geometric ink forgiving for ordinary classroom drawing: a user should be
able to draw a recognizable shape without memorizing an exact stroke topology,
while incorrect automatic replacements remain rare and reversible.

## Product quality contract

1. Recognition is evaluated by the operation the product actually performs.
   `ambiguous` input is not an automatic success.
2. Circle/ellipse and square/rectangle are recognition families. A disagreement
   inside one family must not prevent normalization to the same board primitive.
3. Automatic acceptance targets macro recall `>= 0.90`, macro precision
   `>= 0.97`, ambiguity `<= 0.10`, negative FPR `<= 0.02` and p95 latency below
   `150 ms` on eligible human evidence.
4. The intended class must appear in the first two alternatives at least `0.98`
   of the time. Ambiguous input receives a one-click, non-modal correction path.
5. Basic triangles, quadrilaterals and arrows may be drawn with one stroke or
   with their natural constituent strokes.
6. Production remains gated until Chromium and Firefox captured evidence meets
   the existing per-class quotas. External datasets cannot impersonate browser
   capture.

## Workstreams

### 1. Decision model and metrics

- compare ambiguity across primitive families rather than sibling labels;
- keep circle/ellipse and square/rectangle specialization after family choice;
- route plausible smooth oval-versus-polygon conflicts to user choice instead
  of making a risky automatic replacement;
- make corpus precision, recall and confusion matrices reflect automatic
  acceptance exactly;
- add recall and ambiguity requirements to the quality gate;
- freeze one policy in runtime, reports and documentation.

### 2. Forgiving gestures

- accept both retraced and continuous one-stroke arrowheads;
- tolerate moderate shaft curvature and asymmetric arrow wings;
- recognize a three-stroke arrow;
- join three recent connected lines into a triangle;
- join four recent connected lines into a quadrilateral;
- bound multi-stroke grouping by tool ownership, recency and spatial topology.

### 3. Correction UX

- show compact candidate buttons for cross-family ambiguity;
- keep the original ink until a candidate is selected;
- provide an explicit “keep stroke” action;
- ensure a stale or edited source cannot be replaced;
- explain supported one- and multi-stroke gestures near Smart Ink controls.

### 4. Evidence and regression protection

- add varied deterministic arrow fixtures and multi-stroke tests;
- add tests proving sibling specialization cannot block family recognition;
- verify real Chromium and independent positive/negative corpora with the exact
  runtime policy;
- create recognizer-v5 reports without rewriting historical evidence;
- preserve atomic undo, collaboration compatibility and bounded latency.

## Delivery gates

- Smart Ink unit, corpus, arrow, composite and app workflow tests pass;
- full repository `npm run check` passes;
- browser test sources compile and enumerate successfully;
- the worktree contains only this remediation scope;
- the final commit is pushed to the current feature branch through the GitHub
  connector.

## Implemented result

- recognizer `0.5-spike` uses family-aware decisions and a smooth-oval safety
  check;
- benchmark and calibration paths count ambiguity separately from accepted
  predictions and enforce the complete quality contract;
- one-stroke arrows accept retraced and continuous heads, moderate curvature
  and asymmetric wings;
- recent three/four-stroke arrows and polygons collapse through one atomic
  replacement command;
- cross-family ambiguity offers two accessible choices or preservation of ink;
- v5 Chromium, positive-regression and negative-holdout reports are pinned by
  manifests while historical reports remain intact.

The implementation is complete, but production enablement intentionally remains
blocked by the pre-existing evidence requirement: the repository does not yet
contain the required Firefox and broader captured-device corpus.
