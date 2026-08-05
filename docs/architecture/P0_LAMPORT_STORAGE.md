# Lamport storage reserved by queue schema v2

Queue schema v2 stores one clock per `(documentId, actorId)` and records the
allocated Lamport value plus the server revision observed when a command was
created. The current wire envelope remains version 1.2 during this increment.

The ordered-envelope increment will:

- include Lamport metadata in envelope v1.3;
- advance local clocks from observed remote batches;
- use server revision as the committed total order;
- remove wall-clock timestamp rewriting from rebase;
- preserve timestamps solely for audit and presentation.
