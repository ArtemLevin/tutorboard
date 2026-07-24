# Adapter boundary

Adapters implement external technology behind contracts owned by `core`.

`canvas-konva` is the first concrete adapter. It consumes the immutable
`BoardSceneReadModel` through `core/public`, renders it, and emits viewport
intents to the application composition root. It never owns `BoardDocument` or
imports its reducer.

GeometryOS and persistence adapters are introduced only in their respective
Technical Spike pull requests.
