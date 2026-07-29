# ADR-014: Immutable board evidence at an exact revision

- Status: accepted
- Date: 2026-07-28

## Decision

Finalization requires an available snapshot whose revision and document
SHA-256 match the request. The platform stores a deterministic manifest,
sanitized SVG preview and optional PNG under tenant/lesson keys. Evidence is
unique per board revision and is published or revoked without rewriting its
content.

## Consequences

Later board edits cannot alter historical lesson evidence. The material bundle
contains references and summaries, not the full document. Student and parent
access requires explicit publication. Digest mismatch quarantines evidence.
The transition exporter emits only a public SVG and minimal relative manifest.
