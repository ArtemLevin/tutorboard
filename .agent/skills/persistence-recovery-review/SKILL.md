---
name: persistence-recovery-review
description: >
  Review TutorBoard Dexie, autosave, migrations, server revisions, optimistic
  concurrency, offline queue, retries, conflicts, archive, restore, and
  source-of-truth transitions. Use whenever durable or recoverable state changes.
---

# Purpose

Prevent document loss, duplicate revisions, silent overwrite, and ambiguous
ownership between local and server storage.

# Required context

Read `../../../PLAN.md` sections 6.6 and 7.4, then inspect all writers,
transaction boundaries, schema versions, repository contracts, and recovery UI.

# Workflow

1. Identify source of truth and every writer.
2. State atomicity, optimistic version, idempotency key, retry, and terminal
   states.
3. Model failure before, during, and after durable commit.
4. Check last-good preservation, corruption quarantine, and user-visible status.
5. Define migration, conflict, offline, restore, and archive behavior.
6. Require real repository/integration tests for storage guarantees.
7. Reject process-local coordination for server or multi-tab invariants.

# Output

Return source of truth, writers, atomicity, idempotency, retry/conflict policy,
migration/recovery, invariant IDs, tests, and data-loss residual risk.

# Stop conditions

Stop only when no failure path can silently discard a valid document or report
success before the required durable boundary.

