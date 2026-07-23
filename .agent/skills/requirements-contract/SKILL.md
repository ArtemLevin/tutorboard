---
name: requirements-contract
description: >
  Convert a user request into verifiable engineering constraints. Use before
  standard or deep implementation when acceptance criteria, non-goals,
  compatibility expectations, failure behavior, or scope boundaries must be explicit.
---

# Purpose

Prevent scope drift and make completion objectively testable.

# Inputs

- user request;
- triage result;
- confirmed repository behavior;
- explicit constraints and existing public contracts.

# Workflow

1. State the user-observable goal in one paragraph.
2. Express acceptance criteria as independently verifiable outcomes.
3. Record non-goals and forbidden changes.
4. Identify compatibility requirements for API, storage, configuration, CLI,
   and operations.
5. For TutorBoard changes, classify impact on module boundaries, BoardDocument
   schema, coordinates, geometry semantics, persistence, collaboration,
   security/privacy, and lesson evidence.
6. Map each affected behavior to invariant IDs from `../../../PLAN.md`.
7. Define relevant failure, cancellation, retry, conflict, and recovery behavior.
8. Separate confirmed requirements from assumptions.
9. Mark unresolved decisions that materially block correctness.

# Decision rules

- Do not invent product behavior to make implementation convenient.
- Preserve existing behavior unless the request explicitly changes it.
- Acceptance criteria describe outcomes, not internal implementation.
- Non-goals should prevent plausible scope expansion, not repeat the entire
  repository.
- Use visible placeholders or escalate uncertainty when a missing decision
  changes public behavior.
- Do not describe stored or external contract impact as `none` without checking
  version, migration, unknown-input, and recovery behavior.

# Output

Return goal, acceptance criteria, non-goals, compatibility, invariant IDs,
module/contract impact, constraints, failure/recovery behavior, assumptions, and
unresolved decisions.

# Stop conditions

Stop when each planned production change can be traced to an acceptance
criterion or required compatibility constraint.

