# ADR-012: Same-origin platform gateway and lesson embedding

- Status: accepted
- Date: 2026-07-28

## Decision

TutorBoard is served at `/board/` on the `tutor-assistant-web` origin. Lesson
launch provides only `lessonId` and `documentId`; identity, role and CSRF come
from the authenticated platform session. Browser GeometryOS requests use
`/api/v1/geometryos/`; the backend applies authorization, bounds, timeouts and
correlation IDs before contacting GeometryOS.

## Consequences

No API token or tenant claim enters IndexedDB or the bundle. Direct
browser-to-GeometryOS production access is unsupported. Embedded classroom
mode requires same-origin `frame-ancestors`/`frame-src` and a sandboxed iframe.
Local development may explicitly override the GeometryOS URL.
