# Contract versioning policy

Phase 3 freezes the persisted board and adapter boundaries at `1.0`.

## Persisted documents

- Writers emit only `BoardDocument 1.0`.
- Readers accept `0.1`, `0.2`, and `1.0`.
- Legacy input follows the explicit, validated chain `0.1 → 0.2 → 1.0`.
- A migration may add defaults or change representation, but must not silently
  discard unknown data.
- Unknown schema versions and object kinds remain recoverable as explicit
  incompatibility outcomes with the original input attached.
- Any incompatible stored-shape change requires a new schema version, fixture,
  migration decision, and round-trip tests.

Version `1.0` intentionally has the same stored fields as `0.2`. The version
freeze changes the compatibility promise: subsequent additive feature work in
Phase 3 must either remain valid `1.0` data or explicitly introduce and migrate
to a later version.

## Adapter APIs

Canvas, GeometryOS HTTP, and Dexie adapters expose only their `public.ts`
surface. Each boundary publishes a `1.0` contract marker and consumes contracts
owned by `core`:

- canvas consumes a scene read model and emits interaction intents;
- GeometryOS HTTP implements `GeometryOsClient`;
- Dexie implements `BoardDocumentRepository`.

Application code must import an adapter through its public surface. Generated
DTOs, Konva nodes, Dexie records, and transport helpers are implementation
details and cannot cross into feature or core modules.

Breaking a public adapter signature requires a new contract marker and a
coordinated application change. Adding an optional input or a new export is
compatible when existing callers preserve their behavior.

## Default product path

The application creates a blank local `BoardDocument 1.0`. Demonstration
objects are fixtures only; no spike seed or remote service is required for the
offline single-user path.
