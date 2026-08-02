# Module boundary

Each feature module owns one capability and exposes only `public.ts`.
Cross-module deep imports are rejected by the architecture gate. Feature
directories are added together with their first real behavior, not as
placeholders.

Implemented modules:

- `drawing` owns drawing tools, defaults, interaction state and add-command
  creation;
- `selection` owns selection state, world-space bounds, target normalization and
  selection command creation;
- `local-persistence` owns autosave scheduling, durable retry identity and
  diagnostic document import;
- `svg-import` owns untrusted SVG limits, sanitization, canonicalization, stored
  validation and one-object import commands.
- `geometry-import` owns deterministic GIR semantics and the pure Layout-to-Board
  command adapter;
- `geometry-prompt` owns the cancellable readiness → generate → layout → import
  application workflow without React, HTTP DTOs or document mutation.
- `smart-ink-spike` is an intentionally non-persistent Phase 9 experiment. It
  owns deterministic single-stroke preprocessing, six geometric fits and
  ambiguity scoring together with the versioned corpus benchmark and bounded
  humanized approximations; it does not mutate `BoardDocument` or render
  previews. External human datasets can support calibration but cannot
  impersonate browser capture, and synthetic fixtures cannot satisfy either
  human-data gate. Quick, Draw! trajectories and reconstructed HDS contours
  retain distinct trace provenance; automatic confidence calibration uses a
  deterministic group-safe calibration/holdout split. Captured Chromium
  development evidence additionally exercises incomplete-boundary and concave
  turning rejection while Firefox remains a separate platform gate.
- `smart-ink` adapts a recognized single stroke into BoardDocument 1.0
  primitives, owns the proposal snapshot and creates one atomic
  `core.objects.replace` acceptance command. The app retains the source stroke
  until the teacher accepts the preview.
- `handwritten-function` owns the transient bounded multi-stroke session,
  aspect-preserving request normalization, provider-neutral math-ink contracts,
  constrained LaTeX/JIIX conversion, production expression validation,
  parameter discovery, candidate ranking and an abort-safe fake recognizer. The
  application layer owns canvas events, source-ink persistence, editable review,
  coordinate-plot composition and history. `adapters/math-ink-http` implements
  the public recognizer port through a same-origin bounded contract, while the
  separate `services/math-ink-proxy` process owns Mathpix DTOs, credentials,
  privacy metadata, quotas, retry policy and operational diagnostics.
