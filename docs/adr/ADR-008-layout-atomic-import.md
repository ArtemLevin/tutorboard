# ADR-008: Layout-to-Board atomic import

- Status: accepted
- Date: 2026-07-26

## Context

The accepted GIR semantic plan defines stable identities, references and provenance but intentionally contains no coordinates or Board mutations. GeometryOS now publishes Layout Document `0.1.0` through `POST /api/v1/layout`. TutorBoard must join these contracts without making transport DTOs or SVG part of the persisted board model, and without exposing a partially imported construction.

## Decision

`GeometryOsClient.startLayout` is a bounded, cancellable transport operation. The HTTP adapter validates its request and response with generated standalone validators, enforces request correlation and supported GIR/Layout versions, and converts external DTOs into platform-neutral core types.

`modules/geometry-import` owns the pure `createGeometryImportCommand` join. It recreates the deterministic semantic plan and matches candidates to Layout elements using structured source provenance:

- GIR points become editable ellipse objects;
- explicit or derived segments become editable line objects;
- Layout segment style becomes solid or dashed line style;
- explicit or generated labels become editable text objects;
- local coordinates come only from Layout Document `0.1.0`.

The adapter creates one root group and one `GeometryImportRecord`. The group's local transform is identity; initial board placement is recorded as the import's visual transform. Canonical GIR remains unchanged.

The core reducer accepts one namespaced `core.geometry.import` command containing the objects, group and record. It checks collisions and cross-references before building a candidate `BoardDocument`, then applies the ordinary full-document validator. Every failure returns the original document reference.

## Mapping and provenance

Semantic deduplication takes precedence over duplicate visual primitives. If an explicit segment also represents a triangle edge, TutorBoard creates one Board line and maps both GIR entities to it. Layout provenance selects the explicit segment representation; the duplicate derived edge emitted for rendering is not imported.

Each Board object has one primary GeometryOS source while `GeometryImportRecord.mapping` may associate it with multiple represented GIR entities. Document validation therefore requires the primary mapping and validates all mapped object IDs without requiring every represented GIR ID to equal the primary source.

## Consequences

- no partial document import can be persisted or rendered;
- import identity collisions are deterministic failures;
- imported points, segments and labels use existing editable Board primitives;
- dashed Layout segments require one backward-compatible optional line field, not a BoardDocument version bump;
- serialization preserves canonical GIR, raw response, mapping, request correlation and placement;
- direct movement of imported objects remains blocked until the explicit visual-override policy in PR 2.11;
- PR 2.10 can focus on user-visible orchestration rather than contract or reducer behavior.

## Rejected alternatives

- parsing generated SVG for coordinates or identity: violates the GIR/Layout contract split;
- storing GeometryOS transport DTOs directly: leaks an external schema into core and persistence;
- dispatching one command per imported object: permits partial construction and fragmented revision history;
- applying placement directly to every local coordinate: loses a single reversible transform for the construction;
- guessing missing Layout elements: silently corrupts semantic-to-visual provenance.
