---
name: architecture-guard
description: >
  Check whether a proposed change respects existing architectural boundaries.
  Use for new dependencies, cross-layer behavior, public contracts, service
  boundaries, shared state, infrastructure abstractions, or broad refactors;
  do not redesign the system by default.
---

# Purpose

Prevent local fixes from creating a second source of truth or violating
established ownership.

# Inputs

- requirements contract;
- repository context and dependency direction;
- proposed plan or diff;
- relevant architecture documentation.

# Workflow

1. Identify the current owner of each changed invariant.
2. For TutorBoard, load `tutorboard-architecture` and map the proposal to
   `PLAN.md` dependency rules and invariant IDs.
3. Check dependency direction and layer responsibilities.
4. Look for duplicated state, bypassed abstractions, cycles, deep imports,
   hidden module initialization, and infrastructure leakage.
5. Check whether a public, stored, external, or evidence contract changes
   implicitly.
6. Evaluate new dependencies and abstractions against demonstrated use cases.
7. Compare the proposal with the smallest architecture-compatible alternative.
8. Return approval, constraints, or a blocking objection with evidence.

# Decision rules

- Preserve existing boundaries unless they are the documented source of the
  defect.
- Do not recommend a rewrite when a local compliant fix exists.
- Reject process-local coordination for multi-process invariants.
- Reject a second source of truth unless synchronization semantics are explicit.
- Reject nominal module boundaries that are not enforced by imports, types,
  runtime validation, or tests.
- Reject dynamic plugin infrastructure before a separate approved contract.
- Distinguish architecture defects from stylistic preferences.

# Output

Return decision, constraints, violated invariant IDs, dependency changes,
rejected options with reasons, and the smallest compatible alternative.

# Stop conditions

Stop when the plan has an explicit invariant owner and no unaddressed boundary
violation remains.

