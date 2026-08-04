# Vector Ink 1.0

## Stored contract

`BoardDocument 1.2` stores every `drawing.pen-stroke` with two coordinated representations:

- `points`: the bounded world-coordinate polyline used by Smart Ink, selection, handwriting recognition, and existing geometric algorithms;
- `ink`: canonical Vector Ink 1.0 data containing pressure-aware samples, monotonic relative timestamps, closure state, and a deterministic cubic Bézier centerline.

Validation requires the sample points to match `points` exactly and the centerline to match the deterministic Core fitting algorithm. This keeps serialization, clipboard transfer, persistence, collaboration replay, and exports reproducible across clients.

## Input model

Pointer samples preserve:

- world coordinates;
- normalized pressure in the inclusive range `[0, 1]`;
- monotonic input timestamps in milliseconds.

Mouse and legacy input use a neutral pressure fallback. Duplicate adjacent samples are removed while preserving pressure and timestamp order.

## Geometry

Core derives a cubic Bézier centerline with Catmull–Rom-to-Bézier conversion. A pressure-aware outline is sampled from the centerline with rounded caps and joins. Canvas wet ink, committed canvas rendering, and SVG export use the same Vector Ink geometry functions.

PNG export rasterizes the generated SVG. PDF export embeds the PNG snapshot. This establishes visual parity across all supported export formats.

## Migration

Readers migrate schema versions `0.1`, `0.2`, `1.0`, and `1.1` to `1.2` before validation. Legacy pen points receive:

- neutral pressure;
- deterministic relative timestamps;
- a deterministic cubic Bézier centerline;
- inferred closure state.

The original world coordinates, object identities, ordering, groups, styles, transforms, provenance, and document timestamps remain unchanged.

## Transfer and synchronization

Clipboard payloads and board command envelopes use schema version `1.2`. Copy and paste deep-copy the complete Vector Ink payload while preserving the canonical geometry. Dexie revisions and server snapshots serialize the same `BoardDocument 1.2` representation. Collaboration commands carry pressure, timestamps, and centerline data through the existing command transport.

## Verification matrix

The release gate covers:

- deterministic migration from stored `BoardDocument 1.1` revisions;
- canonical validation of samples, points, timestamps, pressure, and centerline geometry;
- deep clipboard copy and paste of Vector Ink data;
- collaboration command and snapshot transport using schema `1.2`;
- Dexie persistence and reload;
- canvas wet/dry rendering parity;
- SVG outline output plus PNG and PDF derivative exports;
- Chromium and Firefox production smoke;
- production build, immutable container, read-only runtime, and security scanning.

## Invariants

- Maximum 100,000 samples per stroke.
- At least two samples and one Bézier segment.
- Finite coordinates and timestamps.
- Pressure remains within `[0, 1]`.
- Timestamps are monotonic.
- `points[index]` equals `ink.samples[index].point`.
- Stored centerline equals the deterministic centerline derived from samples.
- Unknown schema versions and object kinds remain fail-closed.
