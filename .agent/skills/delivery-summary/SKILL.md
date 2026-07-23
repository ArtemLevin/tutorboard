---
name: delivery-summary
description: >
  Produce the final evidence-based engineering report. Use after implementation,
  checks, and review to summarize changed behavior, TutorBoard invariant and
  contract impact, verification, important decisions, limitations, and residual
  risks without emitting a verbose action diary.
---

# Purpose

Give the user a compact, trustworthy handoff.

# Inputs

- requirements contract and completion gate;
- changed files, modules, invariant IDs, contracts, and behavioral delta;
- exact commands and results;
- review findings and residual risks.

# Workflow

1. State the user-visible result.
2. List only material changes.
3. Report affected module owners and public/stored/external contract impact.
4. Report invariant IDs with enforcement evidence or explicit verification gaps.
5. Report exact checks executed and their status.
6. Explain one or more non-obvious decisions when relevant.
7. Disclose skipped checks, environment limitations, unresolved assumptions,
   migration/recovery status, and residual risks.
8. Mention created branch, commit, PR, artifact, or migration status when
   applicable.
9. Avoid internal chain-of-thought and low-level tool chronology.

# Decision rules

- Never say “all tests pass” when only targeted tests ran.
- Distinguish implemented, verified, reviewed, and merely recommended work.
- Do not claim an invariant passed without naming its actual enforcement.
- Do not bury a failed check under a success summary.
- Do not include unrelated future enhancements unless they block safe use.

# Output

Use `templates/final-summary.md` or an equivalent concise structure.

# Stop conditions

Stop after the result, invariant/contract evidence, verification, significant
decisions, and residual risk are clear.

