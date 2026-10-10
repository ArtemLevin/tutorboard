# C3.9-S2 — same-board cold ink cache causal trial

Date: 2026-10-10 · [issue #201](https://github.com/ArtemLevin/tutorboard/issues/201).

## Motivation

The production Chromium static-board benchmark in PR #215 shows:
- 3k strokes / 2400 visible / 4 PNG + 6 JPEG, DPR2 active-wheel p95 283.4ms
- 5k / 4000 visible, p95 200ms
- 10k / 8000 visible, p95 366.7ms
- 10k / 1000 visible, p95 33.4ms.

The largest 10k scene has >100ms frame gaps on ~52.6% of active frames.
The 10k mostly-offscreen case has only 190 active frames across three runs,
so do not use it for an unqualified tail release claim. All findings are
from CI run 38056187715, Chromium 149 on Linux x64.

Most expensive frames of the primary static-heavy scenario overlap
full-scale Konva scene/hit redraws, React-Konva board commits, and compositor
LayerTree updates. This trial tests a **single reversible mechanism**:
whether first-wheel synchronous raster preparation of immutable pen runs
can pay for itself when the heavy board had no idle time to prepare caches.

## Exact intervention and boundary

`WheelInkCacheCoordinator` already bounds canvas image pixels to 4M,
uses hit canvas pixel ratio 1 and disposes cached images on wheel end.
Ordinary wheel input sets `buildIfUnprepared: false` to avoid a
synchronous first-wheel stall. Here, **only with an injected opt-in
`window.__tutorBoardC37Trace.forceColdWheelInkCache === true`** does
the first-wheel call enable that bounded synchronous preparation.

Default production behavior is unchanged. No persisted format,
database, authorization or public setting changed. No bitmap quality
reduction, GPU layer-cap change or object omission. All four test scenarios
use exactly the same 4 PNG + 6 genuine JPEG assets at 1536×1536,
same local revision restore, z-order, wheel trajectory and DPR2.

A/B inputs:
- 5k strokes / 4k visible: control vs cold cache
- 10k strokes / 8k visible: control vs cold cache

The workflow runs both arms four times on one runner, accumulating
>=200 active frames per arm if the hardware permits. The summary
validates browser version, source SHA, document/media counts, layer count,
cache build count, non-zero cached image pixels and exact control flag.
It reports per-arm active p95/max, fraction of frames >100ms, commit p95,
paired run p95 delta, cold cache build pixel count and first-wheel
synchronous duration. Raw traces are attached for independent review.

## Go / no-go criteria

A production change is permitted only after inspecting actual data
and running further correctness and memory tests. Required:
- consistent p95 and >100ms improvement over same-document control,
  including first-wheel cold-start duration, with no worse max/hard stalls
- bound cache raster pixels and disposal on wheel end / clear / reopen
- screenshot/color/alpha equivalence at DPR1 and DPR2, z-order, hit
  testing, transform/selection, partial eraser and drawing responsiveness
- 48 continuous wheel interactions, no retained cached Konva resources
- preserve redraw behavior when context is changed by another session;
  protect untrusted document import and storage validation.

If the intervention is ineffective, leave the existing behavior and
investigate spatial segmentation/tiling of static ink and isolation of
remaining viewport-command input validation separately. The existing
strict 10 MiB JSON file import boundary continues to require a separate
secure large-document portability specification.
