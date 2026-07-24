---
name: board-document-evolution
description: >
  Protect TutorBoard document, object, command, serialization, identifier,
  grouping, schema-version, migration, history, and import/export invariants.
  Use whenever BoardDocument or any persisted representation can change.
---

# Purpose

Prevent silent incompatibility, partial corruption, nondeterministic state, and
loss of unknown or older document data.

# Required context

Read `../../../PLAN.md` sections 6.2, 6.3, 7.1, and the current document schema
and nearest migration/serialization fixtures.

# Workflow

1. Record schema before and after the change.
2. Identify the owner of every new object or command kind.
3. Check IDs, references, ordering, groups, and command preconditions.
   - `order` is the sole z-order source and contains every object exactly once;
   - group membership is bidirectional, unique, and never references a missing
     object;
   - generic groups own `BoardGroup.transform`, while GeometryOS imports own
     placement only through `GeometryImportRecord.visualTransform`; an import
     root group remains at identity;
   - imported object sets, source back-references, GIR mappings, and visual
     overrides agree exactly.
4. Define backward, forward, unknown-kind, corruption, and recovery behavior.
   Preserve the original input in every non-success reader result.
5. Require a migration decision for every stored-shape change.
6. Verify deterministic serialization with locale-independent key ordering and
   unchanged semantic array order. Reject runtime/canvas state.
7. Verify failed commands return the exact original document reference and that
   reducers receive IDs, actor, and time instead of generating or reading them.
8. Add the smallest fixtures that prove compatibility, provenance, and
   recovery.

# Blocking conditions

- Stored shape changes without a version decision.
- Unknown data is dropped.
- Migration lacks a real fixture.
- Reducer reads clock, UUID, browser, or network state.
- Failed command can partially mutate the document.
- Canvas/runtime state is serialized.
- A second z-order or import-transform owner is introduced.

# Output

Return schema before/after, migration and compatibility decisions, recovery
behavior, invariant IDs, fixtures, checks, and remaining risks.
