# ADR-022: Object settings through right-button double-click

- Status: Accepted
- Date: 2026-08-02
- Scope: TutorBoard object settings and coordinate-plot editor entry

## Decision

1. Creating a drawing object or coordinate plot leaves its settings closed.
2. Ordinary selection, Enter and left-button double-click do not open settings.
3. A right-button double-click on a user object opens the relevant settings surface.
4. Coordinate plots open the dedicated coordinate-plot editor; other user objects open the selection inspector.
5. A single right-button press and right-button drag retain board panning.
6. The double-click recognizer requires the same object, a maximum 450 ms interval and at most 8 px pointer displacement.
7. A right drag beyond the displacement threshold clears the pending click candidate.

## Consequences

Object creation remains uninterrupted and configuration becomes an explicit gesture. The existing right-button pan contract remains available, while the second stationary click is consumed before a board pan session starts.

## Verification

Unit coverage verifies that ordinary selection keeps settings closed, graph creation keeps the editor closed, Enter has no editor side effect and an object-settings request opens the correct surface. Browser coverage verifies right-button double-click routing and preservation of right-drag panning.
