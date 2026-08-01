# Coordinate plot production gate plan

## Goal

PR 6 closes the first production increment for `math.coordinate-plot`. It proves that the object survives the complete TutorBoard lifecycle under release constraints: browser editing, local persistence, recovery, command synchronization, bounded numerical work, production packaging and operational support.

## Implementation status

Completed on PR #60. Deterministic fixtures, targeted integration suites, lifecycle autosave flush, Chromium/Firefox lifecycle, dedicated CI evidence, production image hardening and operations documentation all passed on the same code head. The final documentation-only head reruns the release matrix before squash merge.

## Release invariants

- BoardDocument remains `1.1`.
- Formula evaluation remains local, deterministic and free of dynamic JavaScript execution.
- One coordinate-plot edit session remains one stale-safe semantic command.
- Invalid or undefined points stay isolated to their series.
- Clipboard identity, undo/redo and synchronization preserve the complete definition.
- Release checks cover Chromium and Firefox.
- Performance checks use deterministic representative workloads and explicit point/evaluation budgets.
- Production image checks retain immutable build, non-root user, read-only filesystem and HIGH/CRITICAL vulnerability scanning.

## Work packages

### 1. Deterministic production fixtures

Create reusable fixtures representing:

- explicit polynomial and trigonometric series;
- discontinuities and domain-limited roots;
- parameterized families;
- parametric circles and Lissajous curves;
- hidden series and independent styles;
- a full page containing sixteen coordinate planes.

The fixtures must pass normal domain validation and serialisation.

### 2. Performance budgets

Add a dedicated performance suite covering:

- compilation and adaptive sampling of a representative multi-series plane;
- sixteen coordinate planes on one page;
- bounded aggregate point and evaluation counts;
- deterministic sampling-cache reuse;
- BoardDocument serialisation and deserialisation;
- scene selection and render-model preparation.

Budgets are intentionally generous enough for shared CI runners while still detecting accidental quadratic work or unbounded point growth.

### 3. Local persistence and recovery

Verify:

- exact IndexedDB round-trip of viewport, grid, legend, parameters and multiple series;
- restoration after page reload in Chromium and Firefox;
- fallback to the previous valid revision after corrupting the newest stored revision;
- preservation of a recovery diagnostic record;
- copy/paste after restoration with a remapped board-object ID and stable internal series/parameter IDs;
- best-effort autosave flush when the document becomes hidden or the page is leaving.

### 4. Synchronization and collaborative undo

Verify deterministic convergence for coordinate-plot commands through the server-sync engine:

- base snapshot bootstrap;
- local create and stale-safe update commands;
- offline queue replay;
- accepted server revision and queue acknowledgement;
- remote revision replay;
- exact collaborative inverse for a coordinate-plot update;
- recovery state for incompatible remote data or revision gaps.

### 5. Cross-browser release scenario

In Chromium and Firefox:

1. create a coordinate plane;
2. add explicit and parametric series;
3. add a shared parameter;
4. hide one series;
5. change the internal viewport;
6. save and wait for local persistence;
7. reload the page;
8. reopen the plot and verify the restored values;
9. duplicate the object;
10. export JSON and verify both coordinate-plot definitions.

### 6. Release workflow and evidence

Add a dedicated coordinate-plot production job that runs after the main quality gate and uploads failure evidence. Keep the existing general browser, GeometryOS, Smart Ink and production-image jobs as independent release requirements.

### 7. Operations documentation

Document:

- supported first-version scope;
- hard limits and performance budgets;
- manual browser matrix;
- persistence and recovery procedures;
- synchronization failure handling;
- diagnostics collection;
- release acceptance checklist;
- known extension points for worker sampling, animation and future series kinds.

## Completion criteria

PR 6 is complete when all coordinate-plot-specific tests pass in Chromium and Firefox, performance budgets remain green, local recovery and synchronization are proven, production image checks pass, the PR has no unresolved review threads and the final squash commit is merged into `main`.
