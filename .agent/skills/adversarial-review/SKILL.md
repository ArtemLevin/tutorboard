---
name: adversarial-review
description: >
  Attempt to disprove the correctness of a proposed code change. Use after
  implementation and verification to find contract violations, regressions,
  unsafe assumptions, false-positive tests, and unnecessary scope before delivery.
---

# Purpose

Provide independent, evidence-based review rather than confirmation of the
implementation.

# Inputs

- requirements contract;
- approved plan;
- actual diff and relevant surrounding code;
- test and tool results;
- specialist-review constraints.

# Workflow

1. Reconstruct expected behavior from the contract, not from the implementation.
2. Check each acceptance criterion against the actual diff and evidence.
3. Check every declared TutorBoard invariant ID and search for undeclared
   module, stored, external, coordinate, persistence, privacy, or evidence
   impact.
4. Search for counterexamples, boundary states, retries, partial failures, and
   compatibility regressions.
5. Inspect whether tests would fail if the production change were removed or
   broken.
6. Check for unrelated changes and hidden contract modifications.
7. Classify findings using `policies/severity-model.md`.
8. Tie each project finding to an invariant ID or explain why no existing
   invariant covers it.
9. Propose the smallest safe fix for blocking findings.

# Decision rules

- Do not praise or restate the diff.
- Do not treat preferences as defects.
- Do not request a rewrite without a P0/P1 reason.
- A blocking finding requires a concrete failure path and evidence.
- A new invariant proposed during review must name its owner and enforcement;
  prose-only rules are non-blocking recommendations until accepted.
- Do not require tests for obvious syntax or behavior already protected at a
  stronger boundary.

# Output

Return data compatible with `schemas/review.schema.json`.

# Stop conditions

Stop when every finding has severity, invariant mapping, failure scenario, and
evidence; all acceptance criteria were checked; and further repository reading
would not change the verdict.

