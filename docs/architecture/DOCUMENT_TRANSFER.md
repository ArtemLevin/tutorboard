# Document transfer

Phase 3 exports a `BoardDocument 1.0` as a direct
`*.tutorboard.json` file with media type
`application/vnd.tutorboard.document+json`.

`modules/document-transfer` is the format boundary. Export first validates the
document and then uses the core canonical serializer, so identical documents
produce identical UTF-8 bytes. Import keeps invalid JSON, unsupported schema
versions, unknown object kinds, and invalid references as separate diagnostics.
Supported 0.1 and 0.2 documents pass through the core migration chain before
they enter application state.

The local single-document workspace rebinds an imported document to its local
slot ID. Object, group and GeometryOS provenance identities remain unchanged.
Import never partially applies a document.

The same module creates a deterministic, self-contained SVG diagnostic
snapshot and can rasterize it locally into PNG. It uses the board scene read
model, applies viewport/group/import transforms, excludes hidden objects,
escapes text, and only embeds SVG content that has already crossed the stored
SVG validation boundary. Snapshot creation performs no network request. Both
formats are diagnostic previews; the JSON document remains the source of truth.

Fixture tests cover frozen 1.0 round trips, legacy migration, compatibility
diagnostics, byte stability and SVG escaping.
