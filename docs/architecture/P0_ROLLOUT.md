# P0 integrity rollout

1. Merge the runtime codec and queue schema v2 with legacy read support.
2. Observe quarantine counts in staging and verify that valid legacy queues migrate.
3. Exercise offline reload, conflict and reconnect flows in Chromium and Firefox.
4. Ship the ordered-envelope v1.3 client and server behind compatibility flags.
5. Remove timestamp rewriting after mixed-version validation succeeds.
6. Add application recovery UI before exposing quarantine export to users.

Rollback retains the version-2 IndexedDB stores. A previous client ignores the
additional stores; pending schema-v2 data requires the P0 client for replay.
