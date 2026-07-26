# ADR-010: Visual versus mathematical geometry movement

- Status: accepted
- Date: 2026-07-26

## Context

An imported GeometryOS construction contains two deliberately separate truths:
canonical GIR describes mathematical meaning, while Board objects and transforms
describe its presentation. PR 2.10 selects the complete imported root group, but
movement remained blocked until TutorBoard could distinguish visual placement
from semantic editing.

Applying a drag to every imported object would duplicate placement, weaken
provenance and make future GeometryOS recomputation ambiguous. Treating point
drag or deletion as presentation would silently change the mathematical
construction without changing canonical GIR.

## Decision

TutorBoard classifies geometry changes before enabling them:

| Operation                      | Classification | Decision | Persisted owner                                      |
| ------------------------------ | -------------- | -------- | ---------------------------------------------------- |
| whole-construction translation | visual         | allow    | `GeometryImportRecord.visualTransform.translation`   |
| label offset                   | visual         | allow    | per-object `visualOverrides[*].translation`          |
| style override                 | visual         | allow    | per-object `visualOverrides[*].style`                |
| independent point movement     | mathematical   | block    | future GeometryOS semantic edit/recompute contract   |
| constrained point movement     | mathematical   | block    | future GeometryOS semantic edit/recompute contract   |
| semantic element deletion      | mathematical   | block    | future GIR edit contract                             |
| unclassified change            | unknown        | block    | none                                                 |

The existing selection drag remains one `core.selection.move` command. When its
target is a GeometryOS root group, the reducer composes the delta into the import
visual transform instead of `BoardGroup.transform`. Mixed selections remain
atomic: ordinary objects/groups and geometry import transforms are updated in
one validated candidate document.

Explicit `core.geometry.translate`, `core.geometry.label-offset` and
`core.geometry.style-override` commands support non-pointer callers. Label
offsets are restricted to imported text objects. All visual commands respect
root-group/member locks and preserve canonical GIR, mappings, source
back-references and local object coordinates.

`modules/geometry-movement` owns the policy classifier, command factories and an
injectable experiment logger. Events contain only command/import/object IDs,
timestamp, operation, classification and decision. They never contain prompt,
GIR, response bodies or credentials. Independent point drag is represented by a
default-off feature flag; enabling it is insufficient without a semantic edit
contract.

## Consequences

- a teacher can drag an imported construction as one durable visual unit;
- the root group transform remains identity, so placement has one owner;
- label and style adjustments survive serialization without mutating base
  objects or canonical GIR;
- individual point drag and semantic deletion remain deny-by-default;
- the optional style member is backward-compatible with `BoardDocument 0.2`;
- autosave observes the same single document revision as other commands.

## Rejected alternatives

- rewriting every imported object position: duplicates placement and loses a
  reversible construction transform;
- using the root group transform: violates the established single-owner
  invariant;
- interpreting point drag as a visual offset: displays geometry inconsistent
  with its constraints;
- mutating canonical GIR in the frontend: bypasses GeometryOS validation and
  recomputation;
- logging prompts or GIR for the experiment: unnecessary sensitive payload.
