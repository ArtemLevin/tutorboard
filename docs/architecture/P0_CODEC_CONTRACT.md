# BoardCommand codec contract

`BoardCommand` decoding is strict and versioned.

- Input size is bounded before JSON parsing.
- Every command kind has an explicit schema.
- Unknown fields and unknown kinds are rejected.
- Nested board objects, groups, imports, viewports and coordinate plots reuse
  the canonical `BoardDocument` validation schema.
- Canonical JSON sorts object keys recursively while preserving array order.
- SHA-256 is calculated from canonical UTF-8 JSON.
- Storage and network adapters consume the codec through its public contract.

The codec validates transport and persistence shape. Reducers retain ownership
of contextual document invariants such as object existence, locking and stale
snapshots.
