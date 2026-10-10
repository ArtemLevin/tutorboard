# C3.9-E2 — isolated GIF/paint-run compositor experiment

Date: 2026-10-10 · [issue #201](https://github.com/ArtemLevin/tutorboard/issues/201).

## Scope / hypothesis

The prior [paired C3.9-E1 result](C39_E1_PAIRED_BROWSER_RESULTS_2026-10-10.md)
showed that PR #209 reduced viewport persistence CPU cost while >100 ms
Chromium frame gaps remained frequent. In candidate slow-frame samples,
46/50 slow frames coincided with `LayerTreeHost::DoUpdateLayers` >=25 ms.
The interleaved mixed-media scene invoked the six-layer **single-layer
fallback** in `partitionCommittedPaintRuns`.

This E2 block measures **correlation and isolated factor differences**
before touching renderer behavior. There is no production fast path, no
change to canvas hit testing or object order, and no unverified assumption
that the compositor is the sole cause.

## Controlled browser matrix

The `C39_E2_PROFILE=1` opt-in adds eight scenarios to the existing
Playwright C3.9 profile without changing its seven baseline scenes:

| Scenario | Object content | Ordering / paint layers | DPR | Cache | Trace |
| --- | --- | --- | --- | --- | --- |
| e2-dpr2-png-only | 3k strokes, 10 PNG | 1 static layer | 2 | cold | on |
| e2-dpr2-two-runs | 3k strokes, 6 PNG, 4 GIF | 2 layers, 1 animated | 2 | cold | on |
| e2-dpr2-five-runs | identical media and strokes | 5 layers, 2 animated | 2 | cold | on |
| e2-dpr2-fallback | identical media and strokes | >6 contiguous runs → 1 layer | 2 | cold | on |
| e2-dpr2-fallback-untraced | same fallback | 1 layer | 2 | cold | off |
| e2-dpr2-fallback-warm | same fallback | 1 layer | 2 | opportunistic warm | on |
| e2-dpr1-two-runs | same animated media | 2 layers | 1 | cold | on |
| e2-dpr1-fallback | same animated media | >6 runs → 1 layer | 1 | cold | on |

All scenes contain **3010 persisted objects** and request **800 visible
strokes** from the same 3000 varied-stroke fixture; active wheel movement
uses the same 18-event trajectory and stage viewport. Each PNG is a
real 1536×1536 image, each GIF is an actual four-frame GIF. In the three
DPR2 animated ordering scenes, the objects/media bytes are identical;
only stacking order changes. Thus differences may include pixel
overdraw/order as well as paint-run partitioning and must be interpreted
as an *ordering + layer topology* experiment. The 0-GIF variant is
separate and replaces animated files with extra large PNG; the asset
decode and memory footprint differ, so it is a second, imperfect
contrast.

The test asserts the expected committed layer count and animated layer
count **before driving the wheel** and after the gesture. It retains the
existing Chromium clock-aligned compositor/Konva timing recorder, save
attribution, active/commit rAF phase measurements, GIF wheel pause,
strict board JSON import and isolated browser context. The untraced
variant runs with no C3.9 JS/CDP tracing to check measurement overhead.

## CI, repeatability and parser

Workflow: [`c39-e2-render-run-isolation.yml`](../.github/workflows/c39-e2-render-run-isolation.yml).

It builds the production bundle and runs the eight scenes in a fixed
sequence four times, one Chromium worker with retries disabled. It
retains all logs and Playwright attachments. The new
`scripts/c39/summarize-e2.mjs` parser rejects missing/duplicate variants,
mixed source/browser/OS, inconsistent object/media/DPR/layer counts,
unexpected trace state, and missing active wheel observations.

Output: `c39-e2-results/summary.json` with per-scenario rAF p95/max,
pooled >100 ms rate, viewport commit p95, and the count of top-five
slowest-frame samples overlapping >=25 ms Chromium LayerTree updates or
DrawFrame. Includes repeat-index paired deltas for 2/5 vs fallback,
0 GIF vs 4 GIF, DPR1/2, tracing on/off, cold/warm state.

Interpretation: observational. Sampled trace events can overlap across
threads; their durations are **not additive**. Absolute latency thresholds
are not enforced on shared runner hardware. Four replicates with roughly
60 frames/run generally suffice for a descriptive p95 trend, but any
release p99/tail claim requires stronger evidence and a functional gate.

## Execution

On any pull request touching the E2 spec/workflow, the dedicated GitHub
Actions job runs automatically. Local equivalent on Linux:

```sh
npm ci
npx playwright install chromium
npm run build
C39_E2_PROFILE=1 npm run e2e:c39-profile -- --grep @c39-e2
```

For Windows PowerShell, set `$env:C39_E2_PROFILE="1"` and execute the
last command without the POSIX environment assignment.

Full E2 CI summary plus repeat-level logs must be inspected before
designing production changes.

## Follow-up release decision

If the 2/5-vs-fallback contrasts show a stable compositor tail improvement
independently of tracing and DPR, isolate an actual reversible renderer
intervention (possibly a bounded separate animated paint-run strategy)
and verify exact z-order pixel/alpha parity, hit testing, 48-cycle media
resource cleanup, clear/reopen, and teacher/guest behavior. The safety
limit of six full-canvas layers exists to bound memory; raising it
blindly would be a regression risk.

If the slow tails persist across all layer layouts, prioritize further
compositor/Layers instrumentation and evaluate the remaining strict
full-document **input** validator as a separate CPU optimization with
trusted-state correctness proofs. Continue C3.9-F soak later.
