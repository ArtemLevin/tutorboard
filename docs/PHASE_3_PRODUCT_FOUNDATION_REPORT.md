# Phase 3 — Product Foundation report

## Outcome

Phase 3 is complete. TutorBoard now starts through a product shell and operates
offline as a complete single-user board. The Phase 2 vertical slice remains a
supported capability, but no spike bootstrap is used by the default path.

## Delivered increments

| PR   | Capability                                                         | Evidence                                |
| ---- | ------------------------------------------------------------------ | --------------------------------------- |
| 3.1  | `BoardDocument 1.0`, migrations, adapter contract freeze           | frozen 1.0 fixture and contract tests   |
| 3.2  | bounded command history and undo/redo                              | unit and browser history journeys       |
| 3.3  | copy/cut/paste with deterministic identity remapping               | provenance and browser tests            |
| 3.4  | layers, visibility, locks, groups and z-order                      | reducer, selector and browser tests     |
| 3.5  | user styles and GeometryOS visual overrides                        | round-trip and inspector tests          |
| 3.6  | multiline text and safe offline math labels                        | command, formatter and browser tests    |
| 3.7  | `.tutorboard.json`, migrations and SVG/PNG snapshots               | frozen fixture and download tests       |
| 3.8  | culling, incremental selection, batching and stroke simplification | 5,000-object CI benchmark               |
| 3.9  | keyboard workflow, focus, ARIA and reduced motion                  | unit and browser accessibility journeys |
| 3.10 | routing, documents, settings, flags, notifications and diagnostics | shell route journeys                    |

## Exit criteria

- Stable `BoardDocument 1.0`: met.
- Undo/redo: met, including atomic gesture/import history.
- Import/export: met with deterministic JSON and compatibility diagnostics.
- Usable keyboard workflow: met for tools, selection movement, clipboard,
  history, deletion, help and dialog focus.
- Performance benchmark in CI: met with a representative 5,000-object board.
- No spike-only code in the default path: met; bootstrap enters `ProductShell`.
- Complete offline single-user frontend: met through IndexedDB persistence,
  recovery, document transfer and local snapshots.

## Deferred by design

Identity, lesson context, a server document list, authorization, shared
revisions and collaboration remain Phase 4–6 work. Their placeholders do not
invent a parallel backend or identity model.
