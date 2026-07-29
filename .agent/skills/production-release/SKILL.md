---
name: production-release
description: >
  Review TutorBoard production images, reverse-proxy routing, CSP, browser
  coverage, telemetry, SLOs, backup/restore, staged rollout, and rollback.
---

# Contract

1. Read ADR-015 and the platform SLO/runbooks.
2. Build an immutable, non-root image with no secrets in `VITE_*`.
3. Serve `/board/` behind the platform origin and preserve WebSocket upgrade.
4. Require read-only runtime, dropped capabilities, health checks, security scan,
   Chromium/Firefox E2E, and reproducible build.
5. Switch backend and frontend in the same blue/green slot.
6. Roll back code without deleting command revisions, snapshots, or evidence.
7. Treat data loss, cross-tenant disclosure, and broken restore as release stops.

# Output

Return artifact identity, deployment topology, gates, smoke/SLO evidence,
rollback steps, and manual production approvals still required.
