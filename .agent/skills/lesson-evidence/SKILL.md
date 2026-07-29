---
name: lesson-evidence
description: >
  Review final board revisions, immutable manifests, previews, transcript links,
  material context, publication, revocation, and static student export.
---

# Contract

1. Read ADR-014 and `PERSIST-011/012`, `SEC-007/009`.
2. Require an available snapshot at the exact finalized revision.
3. Hash every artifact and make retries deterministic and idempotent.
4. Never mutate prior evidence when the live board changes.
5. Sanitize SVG, bound PNG/SVG/manifest sizes, and quarantine digest failures.
6. Show student/parent only explicitly published, non-revoked artifacts.
7. Keep public exports metadata-minimized and paths stable.

# Output

Return manifest fields, immutable boundary, authorization matrix, retention,
integrity checks, material consumers, and publication tests.
