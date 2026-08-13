# ADR-029: Compact tool groups and shareable board sessions

## Status

Accepted.

## Context

The minimal chrome introduced by ADR-028 still exposed every drawing and AI
action as a permanent dock button. Adding regular polygons, animated media,
presentation tools and export actions would have made the dock wider than the
mobile viewport. A synchronized board already had server revisions, WebSocket
presence and remote cursors, but the UI did not expose a reliable lesson-bound
share link.

## Decision

The permanent dock groups related actions into Selection, Drawing, Math, AI
and Media menus. Shape tools remain visible inside Drawing rather than using a
separate Shapes trigger. At most one menu is open. Outside click, tool
selection and Escape close it; Escape restores focus to its trigger. Each menu
uses a bounded, responsive surface so all entries remain reachable on desktop
and mobile viewports. Opening a menu moves focus to its first enabled item;
Arrow, Home and End keys provide roving navigation. Settings remain the
rightmost dock action.

Regular polygons use the existing closed pen-stroke representation. The
interaction reducer generates deterministic vertices for 3–24 sides and
stores the resolved fill and stroke style. Render and SVG snapshot adapters
recognise precisely closed strokes as polygons. This preserves BoardDocument
1.1, undo, persistence, clipboard and collaboration compatibility.

GIF files use the existing bounded image-import contract and are stored with
their `image/gif` MIME type. The Konva image renderer keeps animating the
decoded browser image and requests layer redraws while it is mounted.

The laser pointer is presentation-only overlay state. Holding the primary
pointer button records a bounded 96-point local trail whose older segments are
fainter; releasing the pointer fades the trail over 900 ms. It never creates a
board object or command, so it cannot affect undo history, persistence, export
or remote revisions.

PDF export renders the same bounded viewport snapshot used by PNG export, fits
it onto a landscape page and downloads an `application/pdf` artifact. The PDF
library is dynamically imported so the normal board bundle does not pay its
startup cost.

Share links are available only for synchronized lesson-bound boards. They
preserve `lessonId` and `documentId`, target the board route, and rely on the
platform session and server authorization when opened. Collaboration continues
to use the established server revision, WebSocket presence and remote-cursor
contracts; a copied URL grants no additional access by itself.

## Consequences

- The dock remains compact as tool inventory grows.
- Shape and AI features are discoverable by category and keyboard shortcut.
- Polygon support ships without a schema migration.
- Animated GIFs remain normal media objects and participate in persistence and
  collaboration.
- Laser movement and its fading trail are intentionally local and ephemeral.
- PDF export adds a lazy-loaded client dependency and captures the current
  viewport.
- Shared sessions require server-sync configuration and an authorized platform
  session.
- Unit and browser contracts cover menu exclusivity, keyboard focus, polygons,
  GIF persistence, laser ephemerality, PDF signatures and copied share URLs.

## Release contract

The release gate runs type checking, linting, unit tests, architecture and
performance checks, a production build, and Chromium/Firefox browser tests.
Browser coverage opens every dock menu, checks Escape focus restoration and
verifies the new media, presentation, export and sharing paths.
