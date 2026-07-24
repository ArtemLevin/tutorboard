# Module boundary

Each feature module owns one capability and exposes only `public.ts`.
Cross-module deep imports are rejected by the architecture gate. Feature
directories are added together with their first real behavior, not as
placeholders.

Implemented modules:

- `drawing` owns drawing tools, defaults, interaction state and add-command
  creation;
- `selection` owns selection state, world-space bounds, target normalization and
  selection command creation.
