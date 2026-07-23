---
name: tutorboard-architecture
description: >
  Enforce TutorBoard module ownership, dependency direction, composition, ports,
  extension contracts, and architecture invariants. Use for changes to modules,
  public.ts surfaces, core, adapters, dependencies, composition root, shared
  state, or any proposal intended to make TutorBoard extensible.
---

# Purpose

Prevent nominal modularity from becoming cross-layer coupling or a second
source of truth.

# Required context

Read `../../../PLAN.md` sections 3–7 and only the architecture documentation
needed by the affected modules.

# Workflow

1. Name every affected module and its public contract.
2. List added and removed dependency edges.
3. Map the change to `ARCH-*` plus any domain-specific invariant IDs.
4. Verify that side effects cross declared ports and composition remains in
   `app`.
5. Reject deep imports, cycles, hidden module initialization, duplicated state,
   and abstractions without a real consumer or external contract.
6. Require an architecture check for every new enforceable boundary.
7. Return the smallest compatible design and rejected alternatives.

# Output

Return modules touched, public contracts touched, invariant IDs, dependency
edges, new abstractions with justification, verification, rejected alternatives,
and residual risk.

# Stop conditions

Stop when every changed invariant has one owner, dependency direction is valid,
and no boundary relies only on prose review.

