# Ordered Board envelope v1.3 rollout

## Protocol

TutorBoard writes ordered envelope `1.3`. Each queued command keeps:

- `baseRevisionAtCreation` captured when the command enters the durable queue;
- a positive actor-local Lamport value;
- its stable idempotency key and original timestamp.

Confirmed server revision is the total order across clients. Command timestamps are
retained for audit and document metadata; they do not decide command acceptance.
The reducer keeps `updatedAt` monotonic when a client clock is behind the confirmed
document clock.

## Preconditions

- The paired tutor-assistant-web release accepts `1.0`, `1.2` and `1.3` envelopes.
- Database migration `0013_board_ordering` has completed.
- The backend contract source metadata references this finalized TutorBoard commit.
- Mixed-version recovery and clock-skew regression tests are green.

## Deployment sequence

1. Deploy and verify the backend reader and migration.
2. Append and read a synthetic envelope `1.3` through the production gateway.
3. Deploy TutorBoard with `VITE_FEATURE_SERVER_SYNC=true`.
4. Verify one fresh board, one existing legacy board and one offline reconnect.
5. Confirm Chromium and Firefox browser gates.
6. Confirm Smart Ink and Formula Recognition production gates.

## Smoke scenarios

- A new board creates revision-zero snapshot and confirms an ordered command.
- An offline command reconnects, rebases after `409` and preserves idempotency key.
- An uncertain retry already present in the server journal is acknowledged once.
- Client clocks at minus and plus 24 hours still converge by server revision.
- A parent account loads an assigned board without creating or mutating it.

## Rollback

Before any `1.3` write, the previous frontend and backend release can be restored.
After `1.3` data exists, keep the mixed-version backend reader deployed. To stop
new Board writes during an incident, set `VITE_FEATURE_SERVER_SYNC=false` and
redeploy TutorBoard. Existing local queues remain durable until sync is enabled
again.

## Diagnostics

Capture the following when investigating a sync incident:

- document ID and actor ID;
- local confirmed revision and pending count;
- idempotency key fingerprint;
- `baseRevisionAtCreation` and Lamport value;
- server revision, envelope version and payload SHA-256;
- final document SHA-256 and recovery state code.
