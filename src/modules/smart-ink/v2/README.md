# Smart Ink 2.0

Smart Ink 2.0 is the precision-first intent layer above the established geometric fitter.

## Pipeline

1. Build a rich trace from Vector Ink samples (position, time and pressure).
2. Produce geometric candidates with the deterministic fitter and evaluate the arrow recognizer in parallel.
3. Extract stable geometric/temporal features.
4. Score all shape classes plus the explicit `ordinary-ink` open-set class.
5. Apply pairwise circle/ellipse and square/rectangle discrimination.
6. Require class-specific confidence, ambiguity margin and snap quality before auto-accept.
7. Materialize through existing BoardDocument primitives so persistence/sync remain backward compatible.
8. Recognize multi-stroke arrows as an atomic Smart Ink composite.

## Safety invariants

- False auto-accept is more expensive than abstention.
- `ordinary-ink` competes with every geometric class.
- Arrow competes with line; it is not a fallback recognizer.
- Multi-object replacements use one `core.objects.replace` command.
- Field-corpus samples are `unreviewed` by default and must never be treated as ground truth automatically.
- No field-corpus data is uploaded by this module.

## Gold targets

The aspirational release targets are exported as `smartInkV2GoldQualityTargets`. Existing Smart Ink production/holdout gates remain compatibility barriers until sufficient independent human evidence exists to enforce the stricter v2 thresholds.
