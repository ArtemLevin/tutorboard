# C3.9-S5.4 — DPR2 lossless containment, NOT an A2 performance GO

Date: 2026-10-11. Main remains unchanged. Issue #201 remains OPEN.
Source research: S5.3 Draft #222 and S5.4 Draft #223, in particular
[Chromium / Firefox native Konva Path+underlay experiments](https://github.com/ArtemLevin/tutorboard/actions/runs/38129090775).

## Confirmed cause and scope

At DPR2, `Konva.Group.cache` inserts an extra offscreen scene raster
and subsequent backdrop composition. The native 10.3.0 reproducer observed
53/54 changed pixels with two translucent Path objects over an opaque
underlay (Chromium/Firefox), and 3 changed pixels for opaque Paths.
At 128 translucent overlapping Paths, the repro observed 7,813/7,700
differences. Real 320-pen+10-image BoardStage snapshots differed from A0
by 4/5 pixels (maximum channel delta 1/2), with independent A0/A0 noise 0.
No rounding or opacity setting tested to date guarantees exact DPR2 parity.

## Bounded code change

- The opt-in `c39-s5-a2` test bundle keeps its existing pre-mount enable flag.
- Only DPR=1 at initial mount may activate the experimental bounded A2
  cache. DPR2 and fractional DPR start the original A0 renderer,
  including its existing **legacy** wheel-cache behavior and hit nodes.
  The rejected A2 path selects zero A2 candidate runs and allocates zero
  experimental shared A2 raster bytes. Legacy cached runs may still exist.
- A DPR transition away from 1 observed during rendering invalidates
  previously prepared experimental buffers in a layout effect. A browser
  starting at unsupported DPR cannot activate A2 by moving to DPR1 in
  the same mount; it uses the original pipeline until remount. Mid-session
  monitor/DPR transitions require dedicated pixel/lease follow-up tests.
  Document schema, toolbar, persistence and server protocol are untouched.
- The DOM diagnostic `data-c39-s5-a2-raster-supported` makes cache eligibility
  explicit. `data-c39-s5-a2-requested` reports the test opt-in and
  `data-c39-s5-a2-enabled` reports successful initial activation.

## Release gates / strict interpretation

The exact-pixel screenshot test preserves its original zero-noise threshold.
For DPR1 it additionally requires **one genuinely retained native cache**;
for DPR2 it requires **zero experimental candidates and shared A2 bytes**.
Legacy A0 caches are allowed. Therefore DPR2 exact parity proves an
**original-pipeline fallback**, not an accelerated A2.
The Chromium/Firefox S5.3 workflow runs both DPR variants and fails on either.
The S5.4 lifecycle suite exercises DPR1 partial eraser, undo/redo and
48-wheel cache lease cleanup, and a separate DPR2 no-A2-lease regression.
Guest permission changes/reconnect/revocation and sync offline/replay run
with A2 opt-in in the dedicated S5.4 workflow.

These are acceptance checks to be verified on this branch's actual CI.
Do not interpret a green test definition as a completed check.

## Performance / decision

**NO-GO for DPR2 raster A2 and production merge.**
The experiment has no DPR2 A2 activation; an A0/A2 comparison at
5k/10k and DPR2 would compare the baseline against itself and would be invalid
as a performance study. Do not run or report the planned two-runner ABBA
as an A2 benefit until an optimization independently passes strict pixels,
hit identity, interaction, lifetime, guest/teacher and resource checks.
Any future strategy must preserve direct vector backdrop compositing
(e.g. independently measured visibility/hit-work reduction), or formally
obtain a newly reviewed fidelity contract. The >=20% active-p95 target
on **both** 5k and 10k independent runner pairs is unchanged.

This branch is a containment/fidelity investigation PR only and must
remain Draft, stacked on the S5.4 research branch. It is not a
production release or an implementation of the performance milestone.
