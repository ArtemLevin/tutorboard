---
name: platform-integration
description: >
  Review TutorBoard lesson embedding, same-origin platform API, session context,
  role capabilities, GeometryOS gateway, and classroom launch. Use whenever
  TutorBoard is opened from or communicates through tutor-assistant-web.
---

# Contract

1. Read `PLAN.md` sections 6.5–6.7 and ADR-012.
2. Keep credentials in the platform session; never persist CSRF or editable
   tenant/role state.
3. Require same-origin Board and GeometryOS browser traffic.
4. Treat backend authorization as authoritative; UI capabilities are only hints.
5. Verify lesson/document identity, embedding CSP, bounded bodies, correlation
   IDs, negative roles, and cross-tenant non-disclosure.

# Output

Return routes, trust boundaries, affected `ARCH/GEO/SEC/PERSIST` invariants,
checks, and residual deployment assumptions.
