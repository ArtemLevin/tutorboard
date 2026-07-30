# Smart Ink production release gate

## Purpose

`VITE_FEATURE_SMART_INK` separates code and command compatibility from product
availability. Development and test stages enable Smart Ink by default. Production
keeps the feature disabled until the captured Chromium and Firefox quality gate is
approved.

## Effective behavior

When the release flag is disabled:

- the Smart Ink toolbar action is absent;
- shortcut `I` has no effect;
- the recognizer and automatic replacement path receive no gestures;
- the Smart Ink diagnostics panel is absent;
- existing normalized board objects and `core.objects.replace` commands remain
  readable;
- `BoardDocument 1.0`, stored revisions and collaboration contracts remain
  unchanged.

`VITE_FEATURE_SMART_INK_DIAGNOSTICS` is subordinate to the main release flag. A
diagnostics request cannot activate Smart Ink independently.

## Stage defaults

| Stage | Smart Ink | Diagnostics |
| --- | --- | --- |
| development | enabled | enabled |
| test | enabled | enabled |
| production | disabled | disabled |

The immutable image accepts
`--build-arg VITE_FEATURE_SMART_INK=true` for a later approved promotion. Its
default remains gated.

## Verification

The repository verifies both release states:

1. unit tests cover strict flag parsing, stage defaults and diagnostics
   subordination;
2. the standard browser smoke continues to exercise the enabled development/test
   workflow;
3. `Smart Ink production gate` builds a production bundle with the feature
   disabled;
4. Chromium and Firefox confirm that the toolbar action and diagnostics panel are
   absent and shortcut `I` remains inert;
5. the immutable production image uses the disabled default.

## Promotion

Promotion requires the reviewed cross-browser corpus and a passing Phase 9
production report. After approval, build the release image with:

```bash
docker build --build-arg VITE_FEATURE_SMART_INK=true .
```

The production-gate workflow should then be updated in the same release PR to
verify the approved enabled state and its frozen policy version.

## Rollback

Rebuild or redeploy with `VITE_FEATURE_SMART_INK=false`. Stored documents require
no migration because the flag controls tool registration only.
