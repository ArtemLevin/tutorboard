# B2 cross-repo standalone contract sync

This change intentionally contains no frontend runtime behavior.

The standalone-board OpenAPI contract is mirrored byte-for-byte from the B2 backend branch so the frontend can consume the same strict board-scoped access model in the next frontend implementation stage.

B2 refinement: authenticated standalone teacher callers resolve a strict `BoardAccessContext` with `GET /api/v1/boards/context?boardId=...`; guest sessions remain intrinsically scoped to one board. Omitting `boardId` for an authenticated account remains a temporary legacy bridge outside the standalone contract.

The Board command envelope remains `1.5` and is not changed by this contract sync.
