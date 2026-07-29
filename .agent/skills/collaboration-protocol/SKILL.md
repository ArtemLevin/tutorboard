---
name: collaboration-protocol
description: >
  Review TutorBoard real-time rooms, presence, revision signals, own-operation
  undo, reconnect, replay, ordering, and load limits. Use for WebSocket or
  multi-client behavior.
---

# Contract

1. Read ADR-013 and the collaboration invariants in `PLAN.md`.
2. Keep the durable command log authoritative; WebSocket is an acceleration
   channel, not a second writer.
3. Bind rooms to tenant and document; consume short-lived tickets once.
4. Keep presence ephemeral and outside `BoardDocument`.
5. Preserve idempotency keys through reconnect and rebase.
6. Undo only an exact inverse of the current actor's operation; fail closed when
   the existing command contract cannot express one.
7. Test duplicate, delayed, cross-tenant, reconnect, rate, and size boundaries.

# Output

Return ordering/ack model, ownership, recovery path, limits, convergence
evidence, and residual race risks.
