---
name: task-triage
description: >
  Classify a software-engineering request before repository work. Use for every
  non-trivial code, configuration, infrastructure, review, or debugging task to
  select execution mode, risk level, TutorBoard invariant surfaces, relevant
  skills, scope, and context budget.
---

# Purpose

Route the task through the smallest workflow that can provide sufficient
confidence.

# Inputs

- user request;
- repository metadata and shallow tree;
- known project conventions;
- current working-tree status when available.

# Workflow

1. Classify the task type: documentation, bugfix, feature, refactor, review,
   migration, operations, or investigation.
2. Identify user-visible behavior and potentially affected contracts.
3. Estimate blast radius and irreversible consequences.
4. Select `fast`, `standard`, or `deep` mode.
5. List required and optional skills using explicit triggers.
6. For TutorBoard changes, read `../../../PLAN.md` sections 6 and 8, then record
   affected modules, public/stored/external contracts, and invariant IDs.
7. Route changed surfaces:
   - modules, dependencies, composition, or public contracts to
     `tutorboard-architecture`;
   - document, objects, commands, serialization, or migrations to
     `board-document-evolution`;
   - canvas, coordinates, tools, selection, or pointer lifecycle to
     `canvas-interaction-review`;
   - OpenAPI, GIR, client, adapter, layout, or imports to
     `geometryos-integration-review`;
   - Dexie, autosave, revisions, offline, conflicts, or restore to
     `persistence-recovery-review`;
   - SVG to both `svg-security-review` and `security-review`.
8. Add `security-review`, `concurrency-review`, or `database-review` only when
   their trust, interleaving, or durable-state boundaries are touched.
9. Set initial file-reading and iteration budgets.
10. Record assumptions that must be validated by repository context.

# Decision rules

- Use `fast` only for local, reversible changes with obvious verification.
- Use `deep` for auth, secrets, destructive data changes, migrations,
  concurrency, distributed side effects, production infrastructure, or public
  compatibility.
- Do not activate every specialist review defensively.
- Do not classify a schema, coordinate, persistence, geometry contract,
  authorization, or collaboration change as fast.
- Escalate mode when new evidence increases risk; do not downgrade without
  evidence.
- Do not solve the task during triage.

# Output

Return data compatible with `schemas/triage.schema.json`.

# Stop conditions

Stop after mode, risk, scope hypothesis, affected modules/contracts/invariants,
required skills, budgets, and validation assumptions are explicit.

