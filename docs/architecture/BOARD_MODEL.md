# BoardDocument 0.1 contract

`BoardDocument` is TutorBoard's only persisted domain source of truth. The
contract is owned by `core`, contains JSON-compatible data only, and does not
depend on React, canvas, browser APIs, state libraries, persistence, or
GeometryOS transport DTOs.

## Stored shape

| Field                    | Contract                                     |
| ------------------------ | -------------------------------------------- |
| `schemaVersion`          | Literal `"0.1"`                              |
| `id`                     | Branded `DocumentId`                         |
| `title`                  | 1–256 characters                             |
| `createdAt`, `updatedAt` | ISO timestamps with `updatedAt >= createdAt` |
| `viewport`               | Finite world offset and positive zoom        |
| `objects`                | Record keyed by stable `BoardObjectId`       |
| `order`                  | Every object ID exactly once, back to front  |
| `groups`                 | Bidirectional, non-empty object membership   |
| `geometryImports`        | Canonical GIR provenance and visual mapping  |

Identifiers use `[A-Za-z0-9][A-Za-z0-9._:-]{0,127}` and exclude unsafe object
record keys (`__proto__`, `constructor`, and `prototype`). A record key must
equal the embedded entity ID. Branded TypeScript types prevent accidental
cross-domain ID use at compile time; runtime schemas enforce the string and
reference contracts at storage boundaries.

`order` is the only z-order source. Stored objects have no `zIndex`, so ordering
cannot diverge between two fields.

## Board objects

Version 0.1 recognizes these strict discriminated object kinds:

| Kind                 | Kind-specific data                |
| -------------------- | --------------------------------- |
| `drawing.pen-stroke` | At least two world-space points   |
| `drawing.line`       | End vector relative to `position` |
| `drawing.rectangle`  | Positive size                     |
| `drawing.ellipse`    | Positive radius                   |
| `drawing.text`       | Text content                      |

Every object also stores position, rotation, positive scale, visibility,
locking, style, optional group membership, and one source:

- `user` for objects created directly on the board;
- `geometryos` with import ID, GIR entity ID, and GIR entity type.

The `drawing.*` namespace identifies the future feature owner. Core owns the
stored union and its compatibility checks; drawing behavior will be exposed by
the module through its public contract. New stored kinds require a schema
version decision, fixture, reader behavior, and owner review.

Selection, hover, active tools, pointer capture, drag previews, undo stacks,
canvas nodes, and adapter instances are runtime state and are rejected by the
strict stored schema.

## Groups and transforms

Group membership is stored in both directions to support deterministic reads:

- each group contains unique existing `objectIds`;
- each member object points back through `groupId`;
- an object belongs to at most one group.

The validator requires both sides to match. Adding a group or an object to an
existing group updates both sides in one command. Deleting the final user
object removes the empty group.

Generic group placement is stored in `BoardGroup.transform`. Geometry import
placement is the exception: `GeometryImportRecord.visualTransform` is its only
placement owner, and the import's `rootGroup.transform` must remain identity.
This prevents the same movement from being represented twice.

## GeometryOS provenance

`GeometryImportRecord` preserves:

- raw JSON response and canonical GIR as independent JSON values;
- pinned GeometryOS API `1.0.0` and GIR schema `0.2.0`;
- request ID, prompt, and creation time;
- exact imported object set and root group;
- GIR entity-to-board object mapping;
- visual transform and per-object visual overrides.

The object set, root group, source back-references, mapping, and overrides are
cross-validated. Every imported object must have a matching mapping entry.
Canonical GIR is never reconstructed from visual objects.

Generic move/delete commands reject imported objects and import root groups.
Dedicated import commands will later update `visualTransform` or
`visualOverrides` without silently changing canonical GIR.

## Command boundary

Persistent command kinds are namespaced:

| Command                | Atomic intent                                |
| ---------------------- | -------------------------------------------- |
| `core.objects.add`     | Insert one batch at one z-order index        |
| `core.groups.add`      | Create one group and attach its members      |
| `core.objects.move`    | Apply one delta to selected user objects     |
| `core.groups.move`     | Apply one delta to one non-import group      |
| `core.objects.delete`  | Delete one user-object set and repair groups |
| `core.viewport.set`    | Replace committed viewport                   |
| `core.document.rename` | Replace title                                |

Command ID, actor ID, and timestamp are supplied by the application boundary.
The reducer is pure: it does not read clocks, UUID generators, environment,
browser state, or persistence. It validates the current document, metadata,
preconditions, and the complete candidate result. A failed command returns the
exact original document reference and never exposes a partial mutation.

## Validation and read outcomes

Runtime validation has two stages:

1. a strict Zod schema validates shape, scalar bounds, timestamps, and known
   discriminants;
2. cross-reference validation checks identity, ordering, groups, imports,
   provenance, and timestamp ordering.

Readers preserve the original input for recovery:

| Input                             | Result                                      |
| --------------------------------- | ------------------------------------------- |
| Valid 0.1 document                | `status: "ok"`                              |
| Any other explicit schema version | `status: "incompatible-schema"` + raw       |
| Unknown object kind               | `status: "incompatible-object"` + raw       |
| Invalid shape or references       | `status: "invalid-document"` + raw + issues |
| Malformed JSON text               | `status: "invalid-json"` + raw text         |

Version 0.1 is the first stored version, so there is no predecessor migration.
Future readers must either add a tested migration path or retain the explicit
incompatible result. They must never drop unknown data silently.

## Serialization

Serialization validates before writing, recursively sorts object keys with a
locale-independent lexical comparison, preserves array order, and emits compact
JSON. Consequently, equivalent validated records serialize identically while
`order`, stroke points, group membership, and GIR mapping arrays retain their
semantic order.

The canonical fixtures are:

- `tests/fixtures/board-document-0.1.json`;
- `tests/fixtures/geometry-import-board-document-0.1.json`.

## Invariant ownership

| Invariants                     | Enforcement in 0.1                                              |
| ------------------------------ | --------------------------------------------------------------- |
| `DOC-001`–`DOC-006`            | Core types, strict schema, cross-validator, round-trip fixtures |
| `DOC-007`–`DOC-009`            | Explicit read outcomes preserving raw input                     |
| `DOC-010`                      | Stored canonical GIR plus provenance fixture                    |
| `DOC-011`                      | Public reducer boundary and architecture rules                  |
| `DOC-012`                      | Strict schema and serialization tests                           |
| `CMD-001`, `CMD-004`–`CMD-007` | Command union, reducer preconditions, atomic failure tests      |
| `CMD-003`                      | Pure reducer plus AST architecture check                        |

`CMD-002` and `CMD-008` concern browser gestures and remain assigned to the
canvas interaction stage.
