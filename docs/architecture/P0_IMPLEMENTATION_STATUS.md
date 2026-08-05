# P0 implementation status

## Increment P0-01/P0-02

Implemented in the current change:

- strict runtime codec for every `BoardCommand` kind;
- canonical command JSON and SHA-256;
- bounded command payload validation;
- runtime decoding at the IndexedDB and Board HTTP trust boundaries;
- IndexedDB synchronization queue schema v2;
- lazy migration of readable schema-v1 pending records;
- per-document and per-actor Lamport clock storage;
- pending-command quarantine;
- dependency-gap isolation for the queue tail;
- cached confirmed-head document ID and SHA-256 verification;
- architecture, migration, corruption, remote-batch and checksum regression tests.

Validation completed for the increment:

- formatting and ESLint;
- strict TypeScript;
- full unit and integration suite;
- architecture boundaries;
- production build.

## Remaining P0 increments

1. Ordered command envelope v1.3 in TutorBoard and tutor-assistant-web.
2. Removal of wall-clock timestamp ordering and timestamp rewrite during rebase.
3. Quarantine recovery state and diagnostic export in the application UI.
4. Internal authentication for the formula-recognition gateway.
5. Tenant-aware quota reservation and audit trail in tutor-assistant-web.
