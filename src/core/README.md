# Core boundary

`core` owns the versioned BoardDocument contract, commands, pure reducers,
validation, serialization, selectors and declared ports. It remains independent
of React, canvas, persistence, network and feature modules.

The public domain surface is exported from `public.ts`. Stored compatibility is
documented in `docs/architecture/BOARD_MODEL.md`.
