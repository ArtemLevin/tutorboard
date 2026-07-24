# Adapter boundary

Adapters implement external technology behind contracts owned by `core`.

`canvas-konva` is the first concrete adapter. It consumes the immutable
`BoardSceneReadModel` through `core/public`, renders it with optional
runtime-only preview items, and emits viewport and normalized world-pointer
intents to the application composition root. It never owns `BoardDocument`,
imports its reducer, or depends on a feature module.

GeometryOS and persistence adapters are introduced only in their respective
Technical Spike pull requests.
