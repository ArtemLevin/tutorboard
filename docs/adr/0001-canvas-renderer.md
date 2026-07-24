# ADR-001: Canvas is a replaceable renderer

- Status: accepted
- Date: 2026-07-24
- Owners: TutorBoard maintainers

## Context

TutorBoard requires an infinite canvas with pointer interaction, but its
document must remain serializable, testable without a browser and independent
of one rendering library. Persisting or mutating canvas runtime nodes would
make recovery, collaboration and renderer replacement unsafe.

## Decision

Konva may be introduced only as an adapter under `adapters/canvas-konva`.
`BoardDocument` remains the source of truth. The adapter receives immutable
read models, renders them and translates pointer input at the application
boundary; Konva nodes are never serialized or mutated as document state.

## Alternatives considered

### Persist Konva scene nodes

- Advantages: fast initial prototyping.
- Disadvantages: library-specific, non-portable state and ambiguous ownership.
- Rejection reason: violates `DOC-001`, `DOC-012`, `CANVAS-006` and
  `CANVAS-007`.

### DOM/SVG as the primary renderer

- Advantages: native accessibility and inspection.
- Disadvantages: the Technical Spike still requires proof under large,
  interaction-heavy canvas workloads.
- Rejection reason: Konva is the selected spike adapter, while the domain
  boundary keeps later replacement possible.

## Consequences

### Positive

- domain and coordinate tests run without Konva;
- canvas runtime can be discarded and rebuilt from the document.

### Negative and risks

- adapter mapping and pointer normalization require explicit tests;
- temporary drag previews must be kept outside the committed document.

## Verification

PR 2.3 must add architecture checks proving that core does not import Konva and
that the adapter cannot mutate the store directly. Serialization fixtures must
contain no canvas runtime objects.

## Revisit or rollback conditions

Replace Konva if measured interaction, accessibility or rendering constraints
justify another adapter. No BoardDocument migration should be required.
