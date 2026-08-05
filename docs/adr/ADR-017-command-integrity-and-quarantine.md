# ADR-017 — Board command integrity and pending-command quarantine

## Status

Proposed for the P0 integrity and security increment.

## Context

The durable synchronization queue previously validated only command metadata
before casting a parsed JSON object to `BoardCommand`. A malformed IndexedDB
record could therefore reach replay with an invalid command payload. The same
queue also stored no payload checksum and had no isolation path for a corrupt
record.

## Decision

- Every pending command crosses the versioned `BoardCommand` runtime codec.
- Queue schema v2 stores canonical command JSON, command schema version and
  SHA-256.
- Queue schema v2 reserves `baseRevisionAtCreation` and a per-actor Lamport
  counter for the ordered-envelope increment.
- Readable schema-v1 records are migrated lazily in the same IndexedDB
  transaction that reads them.
- A malformed record is moved to a dedicated quarantine store.
- Every later pending record is quarantined as `dependency-gap`, since it may
  depend on objects produced by the first damaged command.
- Confirmed cached heads are accepted only when their serialized document ID
  and SHA-256 match the stored descriptor.
- Quarantine records preserve raw diagnostics locally and are never replayed.

## Consequences

- Storage corruption fails closed before reducer execution.
- Valid commands preceding a damaged record remain deliverable.
- Dependent commands remain available for diagnostic export and explicit
  recovery work.
- The queue already has durable Lamport storage for the next protocol version.
- Quarantine content can contain board data and must stay on the local device
  unless the user explicitly exports a diagnostic bundle.

## Follow-up

The next P0 increment adds ordered envelope v1.3, removes wall-clock conflict
ordering and surfaces quarantine recovery in the server-sync UI.
