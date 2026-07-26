# Geometry movement experiment

- Status: complete
- Fixture: `Построй треугольник ABC и высоту AH`
- Policy decision: ADR-010

## Hypotheses

1. A whole construction can move visually without rewriting Layout-local
   primitives or canonical GIR.
2. Label/style presentation can be stored separately from semantic geometry.
3. Point drag and semantic deletion cannot be enabled safely without a
   GeometryOS edit/recompute contract.

## Experiment

The triangle-altitude fixture produces one import root group with 12 editable
Board primitives. Selection expands any imported hit to the complete root group.
A completed drag emits one `core.selection.move` command.

Reducer and browser evidence check:

- the drag delta is composed into
  `GeometryImportRecord.visualTransform.translation`;
- `rootGroup.transform` remains identity;
- imported object-local coordinates and canonical GIR remain unchanged;
- lock state rejects movement without mutation;
- autosave persists the resulting document;
- reload restores the same translation;
- a label offset composes into its per-object transform;
- style override changes the immutable renderer read model, not the base object;
- generic imported object move/delete remain rejected.

The CI Browser smoke uses the real production bundle, GeometryOS fixture HTTP
server and IndexedDB repository. The final PR 2.11 run (#172) passed the
drag/autosave/reload scenario.

## Result

| Operation | Result | Classification |
| --------- | ------ | -------------- |
| whole construction move | accepted | visual |
| label offset | accepted | visual |
| style override | accepted | visual |
| independent point move | rejected | mathematical |
| constrained point move | rejected | mathematical |
| semantic delete | rejected | mathematical |
| unknown change | rejected | unknown |

Experiment events are injectable and redacted. They contain IDs, timestamp,
operation, classification and decision only. Prompt, GIR, Layout/HTTP bodies and
credentials are excluded.

## Follow-up

Independent-point drag remains behind a default-off flag. Enabling it requires a
versioned GeometryOS semantic edit/recompute contract that returns replacement
GIR, Layout and mapping continuity. Product UI for label/style overrides belongs
to Phase 3 styling work.
