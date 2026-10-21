# Smart Ink 2.0

Smart Ink 2.0 upgrades TutorBoard from a threshold-only geometric recognizer to a precision-first open-set recognition pipeline.

The persisted BoardDocument schema is intentionally unchanged in this delivery. Existing geometric fitting remains the candidate generator; v2 owns intent scoring, abstention, arrow-vs-line competition, pairwise class disambiguation, snap-quality gating, temporal trace features and multi-stroke arrow composition.

## Why open-set recognition

Smart Ink auto-accept makes a false positive substantially more disruptive than a missed recognition. Therefore `ordinary-ink` is a first-class competing class rather than the absence of a sufficiently confident shape.

## Data and calibration

Vector Ink already persists timestamp and pressure samples. V2 consumes those samples without changing document format. A bounded field-corpus recorder can capture only interesting cases locally. Such records are explicitly marked `labelStatus: unreviewed`; calibration or training must not treat them as truth before human review.

The deterministic trainer is intentionally lightweight and offline. It provides a reproducible model-artifact contract without adding TensorFlow or a network dependency.

## Release strategy

The existing Smart Ink Chromium/Firefox production gate, independent positive holdout and independent negative holdout remain mandatory. The stricter `smartInkV2GoldQualityTargets` are evidence targets and should become hard release gates only after a sufficiently large writer/device/browser-disjoint human corpus has been collected.

## Authoritative canvas policy

The V2 decision is authoritative for automatic board replacement: only
`status: accepted` with a matching selected candidate may emit a replacement.
`ordinary-ink`, `ambiguous` and `unrecognized` always retain the source
stroke, even if legacy geometric fitting recognizes a candidate. Legacy
confidence/threshold results remain available in versioned diagnostics and as
V2's geometric candidate generator. Only successfully accepted V2 strokes
participate in automatic multi-object composition. This favors abstention
rather than risky changes to handwritten notes.

Within V2, square/rectangle and circle/ellipse pairs are first resolved by
geometry. Once a pair has a decisive aspect ratio, its sibling does not
introduce another ambiguity veto; borderline aspect ratios retain the
ambiguity safeguard. An accepted elongated ellipse remains an ellipse even
when the legacy UI heuristic previously rounded it into a circle.

This change keeps BoardDocument, existing commands, persisted objects and
collaborative undo/redo unchanged. The checked-in captured Chromium policy
corpus is the compatibility/recall baseline; Firefox and writer-disjoint
validation remain mandatory for production promotion.
