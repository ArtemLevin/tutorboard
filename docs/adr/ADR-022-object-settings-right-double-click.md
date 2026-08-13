# ADR-022: Object settings through right-button double-click

- Status: Accepted
- Date: 2026-08-02
- Scope: TutorBoard object settings and coordinate-plot editor entry

## Decision

1. Creating a coordinate plot opens its editor immediately; ordinary drawing
   objects keep the active creation tool.
2. Ordinary selection exposes the contextual settings surface.
3. The selection surface and context menu provide explicit editing actions.
4. A right-button double-click on a user object remains a compatibility shortcut
   for the relevant settings surface.
5. Coordinate plots open the dedicated coordinate-plot editor; other user objects open the selection inspector.
6. A single right-button press and right-button drag retain board panning.
7. The double-click recognizer requires the same object, a maximum 450 ms interval and at most 8 px pointer displacement.
8. A right drag beyond the displacement threshold clears the pending click candidate.

## Consequences

Configuration is discoverable without memorising a mouse-specific gesture. The
existing right-button pan contract and double-click shortcut remain available,
while touch and keyboard users receive equivalent explicit actions.

## Verification

Unit coverage verifies that ordinary selection keeps settings closed, graph creation keeps the editor closed, Enter has no editor side effect and an object-settings request opens the correct surface. Browser coverage verifies right-button double-click routing and preservation of right-drag panning.
