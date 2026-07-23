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
4. Define backward, forward, unknown-kind, corruption, and recovery behavior.
5. Require a migration decision for every stored-shape change.
6. Verify deterministic serialization and that runtime state is excluded.
7. Add the smallest fixtures that prove compatibility and recovery.

# Blocking conditions

- Stored shape changes without a version decision.
- Unknown data is dropped.
- Migration lacks a real fixture.
- Reducer reads clock, UUID, browser, or network state.
- Failed command can partially mutate the document.
- Canvas/runtime state is serialized.

# Output

Return schema before/after, migration and compatibility decisions, recovery
behavior, invariant IDs, fixtures, checks, and remaining risks.

