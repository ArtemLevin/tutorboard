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

The PR 2.9A semantic step does not create or mutate `BoardDocument` and has no dependency on React, Konva, HTTP, Dexie, the viewport or a coordinate type. PR 2.9B consumes that result without changing this boundary.

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

Line, ray, circle and angle entities are indexed and reference-validated. Layout Document `0.1.0` currently publishes points, segments and labels only, so these entities create `unsupported-visual-entity` warnings and an empty mapping entry.

## Diagnostics and privacy

Diagnostics contain codes, structural paths and semantic IDs only. They do not contain prompts, raw GeometryOS responses, GIR fragments, labels, reasons or arbitrary exception messages. UI and telemetry must decide separately whether and how semantic IDs are displayed.

## Layout-to-Board placement

`createGeometryImportCommand` accepts a validated Layout success result, the import identity, command metadata, prompt and a visual placement. It reruns the pure semantic plan at the module trust boundary and matches each candidate to exactly one Layout element by structured source provenance:

- points become editable `drawing.ellipse` objects;
- segments become editable `drawing.line` objects, including solid/dashed style;
- labels become editable `drawing.text` objects at the target point plus Layout offset;
- segment, point and label z-order is deterministic;
- the root group keeps an identity local transform while the requested placement is stored in the import record's visual transform.

Missing, duplicated or provenance-inconsistent Layout elements fail before a command exists. The adapter does not infer missing coordinates and never reads SVG.

## Atomic mutation and persistence

One `core.geometry.import` command carries every Board object, the root group and the complete `GeometryImportRecord`. The reducer validates import, group and object identities and builds one candidate document. A collision or final document-validation error returns the original document reference; partial imports are impossible.

The record preserves canonical GIR, the validated raw Layout response, request ID, semantic mapping, Board object IDs and visual transform. Existing `BoardDocument 0.2` line, ellipse and text schemas are sufficient, with an optional line style added for Layout segments. Serialization/deserialization therefore needs no document version bump.

PR 2.10 owns the application/UI orchestration that chains generate, layout,
import, rendering and persistence into the user-visible vertical slice.

## Visual movement boundary

PR 2.11 adds no reverse mapping from Board geometry to GIR. Moving the whole
construction changes only `GeometryImportRecord.visualTransform`. Label
offsets/style changes live in per-object visual overrides. Local Board
coordinates, primary/represented provenance, mapping and canonical GIR remain
unchanged.

Point movement and semantic deletion are blocked until a versioned GeometryOS
edit/recompute contract can return replacement GIR, Layout and mapping
continuity. See `CHANGE_CLASSIFICATION.md`.
