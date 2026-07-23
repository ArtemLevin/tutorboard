---
name: verification-router
description: >
  Select the cheapest sufficient verification commands for a change. Use after
  implementation to map changed files, TutorBoard invariants, and behavior to
  syntax, lint, type, unit, integration, contract, migration, security, browser,
  or smoke checks.
---

# Purpose

Avoid both under-verification and wasteful execution of unrelated test suites.

# Inputs

- changed files and symbols;
- behavioral delta;
- risk classification;
- project manifests, CI configuration, and nearest tests.

# Workflow

1. Identify commands already used by the repository and CI.
2. Map each acceptance criterion and risk to an observable check.
3. For TutorBoard, map every affected invariant ID to its enforcement in
   `../../../PLAN.md` section 6 and use section 9 path routing.
4. Order checks from fastest and narrowest to broader and more expensive.
5. Define expansion conditions for each failed or ambiguous result.
6. Trigger `risk-based-testing` when existing checks do not protect changed
   behavior.
7. Trigger the project and specialist reviews selected by `task-triage`.
8. Record commands exactly before execution.

# Decision rules

- Prefer repository-native commands over invented wrappers.
- Run syntax/import checks before expensive suites.
- Run nearest tests before package, service, or full-repository suites.
- Do not use a full suite as a substitute for a missing targeted regression test.
- Do not claim an architecture invariant passed when only lint or compilation
  ran unless that command directly enforces the invariant.
- Do not claim an unavailable environment validates integration behavior.

# Output

Return invariant-to-check mapping, ordered checks, rationale, expected signal,
expansion conditions, verification gaps, and triggered skills.

# Stop conditions

Stop when every acceptance criterion and identified high-risk failure has a
check or an explicitly disclosed verification gap.

