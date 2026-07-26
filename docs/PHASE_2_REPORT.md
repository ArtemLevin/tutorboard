# TutorBoard Phase 2 Technical Spike report

- Status: complete
- Date: 2026-07-26
- Consumer: `ArtemLevin/tutorboard`
- Producer: `ArtemLevin/geometryos`

## Executive result

Phase 2 proved the TutorBoard architecture and the complete single-user
GeometryOS vertical slice:

```text
prompt
  -> readiness
  -> generate canonical GIR
  -> layout
  -> one atomic BoardDocument import
  -> render and select
  -> visual group movement
  -> autosave
  -> reload with provenance and placement intact
```

The spike is complete. Gate A (“Architecture proven”) is satisfied. Phase 3 may
start with contract freeze; Phase 2 does not claim production topology,
collaboration, semantic point editing or a stable `BoardDocument 1.0`.

## Delivered evidence

| Area | Result | Evidence |
| ---- | ------ | -------- |
| modular architecture | core is platform-neutral; public module boundaries are enforced | architecture test in every Quality gate |
| board model | versioned `BoardDocument 0.2`, pure commands/reducer, validation, serialization and recovery | schema fixtures and unit tests |
| infinite canvas | replaceable Konva adapter, pan/zoom and coordinate conversion | canvas architecture and browser smoke |
| authoring | pen, line, rectangle, ellipse, text, SVG insertion | unit/browser scenarios |
| selection | click, marquee, group expansion, one-command movement, lock/delete policy | reducer, interaction and browser tests |
| persistence | Dexie revisions, autosave, optimistic conflict and recovery | persistence tests plus reload scenarios |
| untrusted SVG | bounded deny-by-default sanitization and stored-object revalidation | sanitizer and recovery tests |
| GeometryOS client | pinned OpenAPI/GIR/Layout, generated types, standalone validators, bounded/cancellable HTTP | contract checks and live browser job |
| semantic mapping | deterministic IDs, typed references, provenance and diagnostics | order-invariance and negative fixtures |
| atomic import | Layout-to-Board primitives, one import command, no partial document | adapter/reducer tests |
| prompt flow | readiness → generate → layout → import with typed UI states | orchestrator/App/browser tests |
| visual movement | import transform, label/style overrides, semantic edit denial | ADR-010, policy/reducer tests and drag E2E |

The final PR 2.11 CI run (#172) passed Quality gate, Browser smoke and GeometryOS
live browser contract. The browser scenario imports the triangle-altitude
fixture, verifies 12 objects and one atomic import, drags the construction,
checks the persisted transform delta, reloads, and verifies the same placement.

## Contract baseline

- GeometryOS API: `1.0.0`;
- canonical GIR: `0.2.0`;
- Layout Document: `0.1.0`;
- TutorBoard stored document: `0.2`;
- request correlation: `X-Request-ID`;
- external errors: typed domain outcomes or Problem Details;
- pinned GeometryOS G-11 producer merge: `fe5ece9f7138044d638114907fe9aaecfd14e924`.

TutorBoard stores canonical GIR and the validated raw Layout response separately
from Board objects. It never parses SVG to recover semantic identity or
coordinates.

## Key questions

| Question | Status | Answer |
| -------- | ------ | ------ |
| Can GIR become editable Board primitives deterministically? | answered | yes, through semantic plan plus validated Layout provenance |
| Who owns mathematical meaning? | answered | canonical GIR owned by GeometryOS |
| Who owns Layout coordinates? | answered | versioned GeometryOS Layout Document |
| Who owns board placement? | answered | import `visualTransform`; root group remains identity |
| Who owns viewport navigation? | answered | TutorBoard `ViewportState`; previews remain runtime-only |
| Are visual IDs stable? | answered | deterministic import namespace plus semantic/provenance mapping |
| Can import be partial? | answered | no; one reducer command validates the complete candidate |
| Can the whole construction move? | answered | yes, as a visual transform |
| Can labels/styles change? | answered | yes, as per-object visual overrides |
| Can points move or semantic elements be deleted? | blocked | requires a future GeometryOS semantic edit/recompute contract |
| Is local durability adequate for the spike? | answered | yes; revision, recovery and reload evidence pass |
| Is production GeometryOS topology selected? | partially answered | development/live CORS is proven; production gateway remains Phase 4 |
| Is collaboration selected? | blocked | owned by later server-sync/collaboration phases |

## Data ownership

| Data | Source of truth |
| ---- | --------------- |
| objects, constraints, construction steps | canonical GIR |
| finite rendering coordinates and Layout provenance | Layout Document |
| Board IDs, groups, order and user objects | `BoardDocument` |
| construction placement | `GeometryImportRecord.visualTransform` |
| label/style presentation changes | `visualOverrides` |
| pan/zoom | committed `ViewportState` |
| pointer/drag previews and DPR | runtime only |

See:

- [`architecture/BOARD_MODEL.md`](architecture/BOARD_MODEL.md);
- [`architecture/COORDINATE_SYSTEMS.md`](architecture/COORDINATE_SYSTEMS.md);
- [`architecture/GIR_MAPPING.md`](architecture/GIR_MAPPING.md);
- [`architecture/CHANGE_CLASSIFICATION.md`](architecture/CHANGE_CLASSIFICATION.md).
- [`spike/MOVEMENT_EXPERIMENT.md`](spike/MOVEMENT_EXPERIMENT.md).

## Accepted ADRs

- `0001` canvas renderer boundary;
- `0002` BoardDocument model;
- `0007` modular frontend monolith;
- `0008` foundation quality gate;
- `ADR-006` generated GeometryOS client;
- `ADR-007` deterministic GIR semantic plan;
- `ADR-008` Layout-to-Board atomic import;
- `ADR-009` geometry prompt orchestration;
- `ADR-010` visual versus mathematical movement.

## Rejected approaches

- external DTOs as the Board/store model;
- SVG parsing for semantic identity or coordinates;
- one command per imported primitive;
- placement baked into every imported object;
- simultaneous root-group and import transforms;
- silent point drag as a visual-only edit;
- frontend mutation of canonical GIR;
- logging prompt/GIR/response payloads for the movement experiment;
- choosing CRDT or production direct-browser GeometryOS during the spike.

## Temporary limitations

- Layout renders points, segments and labels; other valid GIR visuals are
  explicit unsupported diagnostics;
- label/style override commands exist, but complete product inspector UX belongs
  to Phase 3;
- independent-point-drag flag is off and cannot bypass the missing semantic edit
  contract;
- imported semantic deletion is blocked;
- persistence is local IndexedDB, not the future server source of truth;
- history/undo, clipboard, accessibility and performance budgets are Phase 3;
- production identity, authorization and GeometryOS gateway are Phase 4;
- the current document schema is `0.2`, not the frozen `1.0`.

No limitation is hidden behind permissive fallback behavior: unsupported,
unknown and semantic operations fail explicitly.

## Follow-up contracts and backlog

- [`GEOMETRYOS_CONTRACT_PROPOSALS.md`](GEOMETRYOS_CONTRACT_PROPOSALS.md);
- [`PHASE_3_BACKLOG.md`](PHASE_3_BACKLOG.md).

The immediate next milestone is PR 3.1: remove spike-only shortcuts, freeze
`BoardDocument 1.0`, and formalize migration and adapter compatibility policy.

## Exit checklist

- [x] infinite canvas, pan/zoom and basic authoring;
- [x] safe SVG insertion;
- [x] generated and runtime-validated GeometryOS client;
- [x] deterministic GIR mapping;
- [x] editable Layout-to-Board primitives;
- [x] selection and group movement;
- [x] local persistence and recovery;
- [x] triangle-altitude E2E through a real `BoardDocument`;
- [x] coordinate, mapping and change-classification boundaries documented;
- [x] ADR set and rejected alternatives recorded;
- [x] GeometryOS follow-up proposals recorded;
- [x] Phase 3 backlog recorded;
- [x] mathematical, layout, viewport and visual-override data ownership
      explained.
