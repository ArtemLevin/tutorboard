# Performance baseline

The Phase 3 representative document contains 5,000 independently positioned
objects. CI enforces generous, non-flaky upper budgets while also checking the
structural optimizations that keep pointer interaction responsive:

- application commands remain the only document mutation boundary; pointer
  previews never rewrite the document;
- `createBoardSceneSelector` retains render-item identity when an object's
  object/group/import dependencies are unchanged;
- the selector cache is replaced on every document open and exposes an explicit
  reset, so closed documents are not retained;
- the canvas excludes hidden and offscreen objects with a 160 px overscan;
- visible nodes are grouped into stable batches of at most 250 objects;
- completed pen strokes use iterative Ramer–Douglas–Peucker simplification and
  retain their endpoints and meaningful corners.

`npm run performance` measures initial selection, viewport culling and a
single-object incremental update. The budgets are 1,000 ms, 1,000 ms and
500 ms respectively on the shared CI runner. The test also repeatedly opens
large documents and verifies that the cache never exceeds the active document.
