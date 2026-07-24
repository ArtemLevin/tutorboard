# ADR-002: BoardDocument is the serializable source of truth

- Status: accepted
- Date: 2026-07-24
- Owners: TutorBoard maintainers

## Context

TutorBoard must preserve objects across reload, later synchronize revisions and
retain canonical GeometryOS provenance. UI state, canvas state and persisted
state cannot each become independently editable sources of truth.

## Decision

`BoardDocument` is a versioned, JSON-serializable domain model owned by `core`.
Committed changes pass through commands and reducers. Selection, hover, pointer
capture and drag previews are runtime-only. External GIR and provenance are
preserved through explicit import records rather than inferred from visual
objects.

The concrete `BoardDocument 0.1` contract is documented in
[`../architecture/BOARD_MODEL.md`](../architecture/BOARD_MODEL.md). Version 0.1
is the first stored version, so its reader returns explicit recovery results
instead of defining a predecessor migration.

`order` is the sole z-order source. Generic groups own their transform, while a
GeometryOS import owns placement through `GeometryImportRecord.visualTransform`;
its root group remains at the identity transform.

## Alternatives considered

### Zustand store shape as the persisted contract

- Advantages: fewer mapping layers.
- Disadvantages: UI/runtime concerns become stored compatibility concerns.
- Rejection reason: state-library replacement and recovery would require
  document migration.

### Canvas scene as the document

- Advantages: direct rendering.
- Disadvantages: library lock-in and loss of mathematical provenance.
- Rejection reason: violates the accepted source-of-truth boundary.

## Consequences

### Positive

- serialization and migration can be tested without UI;
- adapters remain replaceable;
- future collaboration has one document contract to version.

### Negative and risks

- commands and mapping add explicit translation work;
- unknown object kinds and corrupted documents need recovery paths from the
  first stored version.

## Verification

PR 2.2 enforces `DOC-001` through `DOC-012` with strict runtime validation,
round-trip and provenance fixtures, atomic reducer tests, recovery tests and
import/nondeterminism architecture checks.

## Revisit or rollback conditions

The document representation may evolve only through versioned migrations or an
explicit incompatible result. UI or canvas convenience is not sufficient
reason to create another serializable source of truth.
