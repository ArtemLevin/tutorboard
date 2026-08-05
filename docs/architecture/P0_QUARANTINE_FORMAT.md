# Pending-command quarantine format

Each quarantined record contains:

- local quarantine ID;
- document, actor, sequence and idempotency metadata when recoverable;
- capture time and reason code;
- original raw record;
- expected command SHA-256 when present;
- structured codec issues;
- source boundary.

The first invalid command keeps its concrete failure reason. Every later queue
entry receives `dependency-gap`, since replaying it without its predecessor can
violate causal assumptions. Quarantined records are removed from the active
queue and are excluded from automatic synchronization.
