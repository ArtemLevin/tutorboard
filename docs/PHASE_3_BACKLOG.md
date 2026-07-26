# Phase 3 Product Foundation backlog

Phase 3 turns the proven spike into a stable offline single-user product
foundation. Ordering is intentional.

| Priority | Milestone | Outcome | Gate |
| -------- | --------- | ------- | ---- |
| P0 | PR 3.1 Contract freeze | remove spike-only shortcuts, freeze `BoardDocument 1.0`, migration policy and adapter APIs | schema fixtures and migrations |
| P0 | PR 3.2 History | bounded undo/redo; one history item per gesture/import | reducer and browser undo evidence |
| P0 | PR 3.3 Clipboard | deterministic copy/cut/paste and ID remapping with group/provenance policy | round-trip tests |
| P1 | PR 3.4 Layers | z-order, visibility, locks and group management UI | command invariants |
| P1 | PR 3.5 Styling | inspector for base styles and GeometryOS visual overrides | serialization/render tests |
| P1 | PR 3.6 Text/math | text editing and safe math-label rendering | sanitization and accessibility |
| P1 | PR 3.7 Import/export | deterministic document JSON export/import and compatibility diagnostics | fixture round trips |
| P1 | PR 3.8 Performance | large-document benchmark and incremental scene/read-model updates | CI budgets |
| P1 | PR 3.9 Accessibility | keyboard workflow, focus, shortcuts help and reduced motion | automated/manual baseline |
| P2 | PR 3.10 Product shell | routing, document list placeholder, error boundaries, notifications and flags | browser journeys |

## Exit criteria

- stable `BoardDocument 1.0`;
- undo/redo and deterministic import/export;
- usable keyboard workflow;
- measured performance baseline in CI;
- no spike-only behavior in the default product path;
- complete offline single-user operation.

## Explicitly later

After Phase 3:

1. `tutor-assistant-web` identity, lesson and GeometryOS gateway integration;
2. server revisions and offline synchronization;
3. collaboration protocol and two-client convergence;
4. lesson evidence and publication;
5. production security, observability, backup and release gates;
6. advanced semantic geometry editing after an accepted GeometryOS edit
   contract.

CRDT choice, semantic point drag and production direct-browser GeometryOS access
remain undecided until their owning phases.
