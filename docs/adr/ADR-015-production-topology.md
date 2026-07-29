# ADR-015: Same-slot immutable production deployment

- Status: accepted
- Date: 2026-07-28

## Decision

TutorBoard is a non-root immutable nginx image routed by Caddy under `/board/`.
Backend and frontend versions occupy the same blue/green slot and switch
together after migrations, readiness and smoke checks. GeometryOS remains
behind the authenticated backend gateway.

## Consequences

The frontend image contains public configuration only, runs read-only with
dropped capabilities, and is scanned for High/Critical vulnerabilities.
Chromium and Firefox smoke tests precede the image gate. Rollback switches both
application images while durable revisions, snapshots and evidence remain in
PostgreSQL/S3. Production activation still requires the environment's manual
approval and restore drill.
