# ICE-01 — deterministic trace-off baseline protocol

**Status:** implementation candidate, pending exact-head CI and review  
**Date:** 2026-11-17  
**Source:** [ICE 2.0 implementation plan](../plans/INFINITE_CANVAS_ENGINE_2.md), [ADR-033](../adr/ADR-033-infinite-canvas-engine-2.md), [C3.9 issue #201](https://github.com/ArtemLevin/tutorboard/issues/201)

## Objective and scope

Extend the existing C3.9 browser harness without changing the production
canvas, command reducer, document, media format or import limitations.

ICE-01 records a **descriptive baseline**, not a treatment/control comparison.
Its results cannot establish a 20% improvement, an end-to-end 100k capability,
or production smoothness. Reference C3.9 scenarios remain unchanged unless
the explicit ICE-01 environment flags are supplied.

## Representative workloads

All cases use the production build, production IndexedDB revision loader,
deterministic varied pen geometry, ten real 1536×1536 static images
(4 PNG + 6 JPEG with `.jpg` and `.jpeg` variants), DPR2, cold
`requestIdleCallback` starvation, trailing/static z-order and one
committed content layer. SVG, GIF, transformed groups and interactive
plots remain separate C3.9/feature regression scenarios; ICE-01 begins with
static-ink scene scaling.

| Scenario | Stored ink objects | Intended visible strokes | Enabled |
| --- | ---: | ---: | --- |
| ice2-1000-static | 1,000 | 800 | Standard ICE-01 |
| ice2-3000-static | 3,000 | 2,400 | Standard ICE-01 |
| ice2-5000-static | 5,000 | 4,000 | Standard ICE-01 |
| ice2-10000-static | 10,000 | 8,000 | Standard ICE-01 |
| ice2-30000-offscreen | 30,000 | 1,000 | Explicit large-only research |
| ice2-100000-offscreen | 100,000 | 1,000 | Explicit large-only research |

The visible count is a **fixture placement request**. Actual visible object
count depends on camera geometry, viewport boundaries and overscan; it must be
measured separately before using these results as a visibility-specific claim.

The large scenarios intentionally emphasize restore/scene-size with mainly
offscreen content. Running them does not prove an interactive 100k dense scene.

## Run and integrity

```bash
npm ci
npm run build
# Run only the new matrix, three independent browser contexts per case.
ICE_BASELINE_PROFILE=1 npm run e2e:c39-profile -- --grep @ice2-baseline
# Optional heavyweight research, deliberately omitted from normal CI.
ICE_BASELINE_PROFILE=1 ICE_BASELINE_LARGE=1 npm run e2e:c39-profile -- --grep @ice2-baseline
```

Windows PowerShell:

```powershell
$env:ICE_BASELINE_PROFILE = "1"
npm run e2e:c39-profile -- --grep "@ice2-baseline"
Remove-Item Env:\ICE_BASELINE_PROFILE
```

GitHub Actions `.github/workflows/ice2-baseline.yml` runs the regular
matrix three times, then calls `scripts/c39/summarize-ice-baseline.mjs`.
The manually dispatched `include_large` input adds 30k/100k.

Each report contains:
- tested source SHA/browser/OS/CPU architecture and workload metadata;
- SHA-256 of the complete generated BoardDocument JSON, including ordered
  ink/media items, and SHA-256 of real generated static media data URLs;
- initial/final committed layer count, image dimensions and codecs;
- all 18 observed wheel inputs and separate active, commit and settling
  frame p50/p95/p99/max, >25/>50/>100 ms counts;
- import/restore duration, trace flag and any available existing C3.9
  attribution fields.

The parser rejects missing/duplicate/unknown scenarios, changed source/browser
and media/fixture hashes, inconsistent object/media dimensions, trace-on
records, broken phase distributions and missing wheel inputs. Raw logs and
Playwright JSON attachments are retained in Actions artifacts (14 days).
A p99 from approximately 200 frames is flagged as **insufficient evidence**;
the emitted number is descriptive only.

## Measurement limitations and follow-up

- The C3.9 wheel driver sends one event per rendered frame; at high load the
  120 ms viewport debounce can fire between wheel events. Thus the total
  active window may include viewport persistence and input scheduling.
- Browser Chromium CI is a reproducibility vehicle, not an exact proxy for
  a teacher's Windows GPU, high-frequency pen or Firefox.
- Real image byte encoding/decoding is performed by the browser. JPEG bytes
  may vary across browser versions; comparing manifest hashes protects runs
  from accidentally treating different media as identical.
- No A/B pair exists in ICE-01; an ICE-04/06 candidate requires independent
  counterbalanced ABBA with matching document + final camera/interaction
  outcomes, trace-on causal attribution and trace-off timing.
- Memory/GPU usage and actual visible populations require follow-up
  instrumentation. A successful baseline suite cannot be used as the
  full ICE-01/ICE-06 release certificate.

**Exit for this first ICE-01 slice:** tests and production-built browser
matrix run successfully, artifacts contain verified per-scenario hashes and
complete samples, summary marks insufficiency where appropriate. If CI fails,
retain the PR experimental and report the blocker. The next ICE-01 extension
adds mixed-asset/plot scene profiles, reliable viewport delivery/visibility
integrity and additional independent repetitions.
