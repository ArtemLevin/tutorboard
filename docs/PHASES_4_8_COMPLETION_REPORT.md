# TutorBoard phases 4–8 completion report

## Delivered

- Lesson launch and sandboxed embedding from `tutor-assistant-web`.
- Same-origin Board API and authenticated GeometryOS gateway.
- Server revisions, snapshots, archive/history, durable offline queue and
  deterministic rebase after `409`.
- Tenant/document WebSocket rooms, revision signals, cursor/viewport/selection
  presence, reconnect, bounded messages and own-operation inverse commands.
- Immutable board evidence with SHA-256 manifest, SVG/PNG previews, transcript
  links, material-bundle references, portal publication/revocation and minimal
  static export.
- Non-root immutable TutorBoard image, `/board/` reverse proxy, coordinated
  blue/green rollout, CSP, privacy-safe telemetry, SLO/runbooks, Trivy and
  Chromium/Firefox CI.

## Preserved contracts

`BoardDocument 1.0`, GIR `0.2.0` and Layout Document `0.1.0` are unchanged.
Presence is runtime-only. Durable edits still cross the `BoardCommand`
boundary. GeometryOS remains the mathematical source of truth and receives no
direct production browser traffic.

## Release gates

Source completion requires both repositories' full checks, migration
upgrade/downgrade/drift, PostgreSQL/Redis/MinIO integration, browser E2E and
container scan. Activation in a real environment additionally requires image
publication, staging smoke/load, backup restore drill and manual production
approval; code completion does not claim that operational approval occurred.
