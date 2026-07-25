# GIR semantic mapping

## Boundary

The semantic pipeline is intentionally split:

```text
GeometryOS success result
  -> canonical GIR JsonValue
  -> generated GIR 0.2 runtime validator
  -> entity indexes and reference graph
  -> deterministic GeometryImportSemanticPlan       (PR 2.9A)
  -> Layout Document 0.1 + Board object renderers
  -> one atomic import command                       (PR 2.9B)
```

PR 2.9A does not create or mutate `BoardDocument` and has no dependency on React, Konva, HTTP, Dexie, the viewport or a coordinate type.

## Inputs and outputs

Input:

- canonical GIR JSON;
- a pre-created `GeometryImportId`.

Successful output:

- GIR schema version;
- deterministic root group ID;
- semantic point, segment and label candidates;
- GIR object ID to future Board object ID mapping;
- primary and represented provenance per future Board object;
- normalized object, constraint and construction-step references;
- sanitized warnings.

Failure output:

- stable failure code;
- sanitized deterministic diagnostics;
- no plan and no partial identities.

## Validation and limits

The module validator is generated from `contracts/geometryos/gir.schema.v0.2.json`. Generation drift, raw Node ESM import and positive/negative execution are enforced by the contract test through `checkGeometryImportContract`. After a GeometryOS repin, regenerate the transport artifacts first and then run `node scripts/generate-geometry-import-contract.mjs`.

The module additionally applies bounded semantic limits to objects, constraints, construction steps, references, IDs and labels. Processing is iterative and `O(N + R)` for entity count `N` and reference count `R`.

## Reference rules

Object references are type-checked: segments and lines reference points, rays reference start/through points, circles reference center/radius points, triangles and angles reference points, and labels reference an existing object.

All current GIR constraint kinds are checked against their expected target kinds. Construction-step object and constraint references are also resolved. Duplicate IDs are errors inside each namespace. The same string may exist in different typed namespaces because references declare their target category.

## Deterministic identities

Identity components are encoded without reading clock, random, DOM or environment state. The module uses the existing core `boardObjectId` and `groupId` constructors as the final compatibility gate.

Changing source array order does not change candidates, mappings, provenance, references or diagnostics. Changing the import ID creates a disjoint identity namespace.

## Candidate rules

### Points

Every GIR point creates one point candidate. A non-empty point label creates a synthetic label unless an explicit GIR label already targets that point.

### Segments and triangle edges

Every explicit GIR segment creates a segment candidate. Triangle sides are matched by unordered endpoint pair:

- one explicit match: reuse it and add the triangle to represented provenance;
- no match: create a deterministic synthetic triangle-edge candidate;
- more than one match: fail as ambiguous.

No decision depends on an object name such as `AB`, label text or SVG markup.

### Unsupported visual entities

Line, ray, circle and angle entities are indexed and reference-validated. Until a Board representation and layout contract are accepted, they create `unsupported-visual-entity` warnings and an empty mapping entry.

## Diagnostics and privacy

Diagnostics contain codes, structural paths and semantic IDs only. They do not contain prompts, raw GeometryOS responses, GIR fragments, labels, reasons or arbitrary exception messages. UI and telemetry must decide separately whether and how semantic IDs are displayed.

## Deferred work

PR 2.9B owns:

- Layout Document runtime validation;
- local coordinates and bounds;
- geometry Board object kinds;
- styles and renderers;
- `GeometryImportRecord` construction;
- one namespaced atomic import command;
- persistence round-trip evidence.
