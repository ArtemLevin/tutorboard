# ADR-028: Minimal board chrome

## Status

Accepted.

## Context

The board accumulated permanent navigation, action, layer, prompt, help,
coordinate and status panels. These surfaces reduced the usable canvas and made
the common teaching flow visually dense.

## Decision

The board route owns one permanent surface: a bottom-centred tool dock. The
canvas fills the complete route. Primary tool options appear in a contextual
surface attached to the dock. Document, layer, view, recognition, lesson,
shortcut and application controls live in a settings sheet opened by the
rightmost gear button.

Tool presets are versioned browser-local preferences. A completed object stores
its resolved ObjectStyle in BoardDocument, so document schema 1.1, collaboration,
undo, persistence and export contracts remain unchanged. Drawing start actions
receive the resolved style explicitly, keeping the interaction reducer
deterministic and independent from browser-local preference storage.

The application shell hides product navigation only for the board route. Other
routes retain normal navigation. Server-session controls are supplied to the
board settings sheet instead of consuming permanent vertical space. Escape
closes the topmost nested overlay first, then the settings sheet on a subsequent
press. Contextual options expose a named region so keyboard and assistive
technology users can distinguish them from the permanent toolbar.

## Consequences

- Canvas space is maximised on desktop and mobile.
- Common tools remain one click away.
- Advanced operations require an explicit settings action.
- Tool preferences remain local to one browser installation.
- Existing command and persistence boundaries stay intact.
- Visual and browser tests target the dock and settings sheet contracts across
  desktop, mobile portrait and mobile landscape profiles.
- Desktop coordinate-plot baselines are committed independently for Chromium
  and Firefox to preserve renderer-specific release evidence.
- Selected text, style, lock, deletion and quick transforms remain available in
  the contextual dock surface.

## Release contract

The release gate verifies that the board route has one permanent toolbar, that
the settings gear is its rightmost action, and that local and synchronized
workspaces preserve drawing, selection, plotting, recognition, recovery and
evidence workflows across Chromium and Firefox.