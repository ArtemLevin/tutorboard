# C3.9-E2 — verified Chromium paint-run factor isolation

Date: 2026-10-10 · [issue #201](https://github.com/ArtemLevin/tutorboard/issues/201).

## Verified execution

- Implementation: [PR #213](https://github.com/ArtemLevin/tutorboard/pull/213), merged as `095b4d20b0e673e4e0fc0ce7a1fef8dfab879d44`.
- [Four-repeat eight-scenario GitHub Actions run 38052898780](https://github.com/ArtemLevin/tutorboard/actions/runs/38052898780): successful, including summary validation. Retained console `C39_E2_ISOLATION_SUMMARY` and artifact `c39-e2-render-run-<sha>` with raw logs and Playwright traces.
- [Existing seven-scene baseline 38052898631](https://github.com/ArtemLevin/tutorboard/actions/runs/38052898631) successful.
- [Full CI 38052898604](https://github.com/ArtemLevin/tutorboard/actions/runs/38052898604): all 8 jobs successful, plus separate Smart Ink, Formula Recognition, Paddle gates green.
- Chromium `149.0.7827.55`, Linux x64, single GitHub runner. Each scene repeated four times with fresh browser context and identical 1240×820 stage, 3000 varied strokes, 800 visible ink objects and ten media objects, same wheel trajectory. DPR, media type, layering topology, source z-order, cold/warm state and trace-on/off varied only as declared.

## Observed browser latency

Values are medians of four *per-run active-phase p95* measurements and the combined fraction of active rAF frame gaps over 100 ms. Source: `C39_E2_ISOLATION_SUMMARY` from the successful workflow.

| Scene | DPR | Retained layers | Active frames | Median run p95 | >100 ms gaps | Commit median run p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 10 PNG, 0 GIF | 2 | 1 | 217 | **41.75 ms** | **0.5%** | 66.65 ms |
| 6 PNG + 4 GIF, trailing order | 2 | 2 (1 animated) | 209 | **33.40 ms** | **0%** | 66.70 ms |
| Same objects, split order | 2 | 5 (2 animated) | 250 | **199.95 ms** | **19.2%** | 200.00 ms |
| Same objects, alternating order / >6-run fallback | 2 | 1 | 296 | **116.60 ms** | **6.4%** | 133.35 ms |
| Alternating order without JS/CDP tracing | 2 | 1 | 262 | **108.35 ms** | **6.9%** | 124.95 ms |
| Alternating order, opportunistic warm | 2 | 1 | 288 | **116.65 ms** | **6.6%** | 133.35 ms |
| 6 PNG + 4 GIF, trailing order | 1 | 2 | 270 | **16.75 ms** | **0%** | 66.65 ms |
| Alternating order / fallback | 1 | 1 | 271 | **16.80 ms** | **0%** | 83.25 ms |

**Paired repeat-index median p95 deltas (candidate − control):**

- Fallback vs 2 runs, DPR2: **+83.20 ms**.
- Fallback vs 5 runs, DPR2: **−83.35 ms**. Five separate full-canvas layers were *worse* than the fallback.
- Fallback vs 0-GIF scene, DPR2: **+66.55 ms**, but media types, memory/decoding costs and ordering differ.
- Fallback with tracing vs same fallback without tracing: **−0.05 ms** paired median, supporting that the main trend is not simply trace-recorder overhead.
- Fallback DPR2 vs DPR1: **+99.80 ms** paired median; resolution-dependent compositor/raster work is a strong candidate.

## Clock-aligned slow-frame observations

Among the *five slowest frames sampled per execution*, including ties:
- 5-run scene: `LayerTreeHost::DoUpdateLayers` >=25ms coincided with **20/20** sampled slow frames; `DirectRenderer::DrawFrame` >=25ms with **19/20**.
- Alternating fallback scene: long LayerTree updates in **20/20** and long DirectRenderer frames in **11/20**.
- 2-run scene: long LayerTree updates in **2/11** and DirectRenderer frames in **8/11**.
- DPR1 2-run and fallback scenes: **0** >=25ms layer updates among the sampled slowest frames.

These are correlated events on multiple renderer/compositor threads. Event durations cannot be summed to attribute elapsed frame time. The sample is intentionally biased to slow frames.

## What E2 proves and does not prove

The E2 matrix verifies the reproducibility of a strong **DPR2 x ordering/paint-run-layout** interaction in a real browser with a large mixed board. Merely adding independent layers did not improve performance: five layers had a substantially worse p95 and tail. The existing six-layer memory cap is a meaningful protection and **must remain unchanged** pending further investigation.

The comparison is observational: different object orders preserve the identical object set and media bytes but change occlusion, overdraw and resulting pixels. It therefore cannot, by itself, attribute the change solely to the number of layers or prove an exact production optimization. Four repeats on a shared CI runner are meaningful screening evidence, not a universal 60-FPS or cross-device sign-off. Strict 60-FPS-equivalent rAF p95 <16.7ms is not proven at DPR2.

## C3.9-E3 — next bounded causal engineering block

1. **Reproducer:** hold the full BoardDocument, viewport/zoom trajectory, scene object order, media bytes and Chrome/DPR2 constant. Add a *strictly test-only* reversible rendering intervention to compare two paint/compositor strategies against the **same pixels and z-order**, with a bounded layer-count/GPU-memory guard. Do not globally raise `maximumCommittedPaintLayers`.
2. **Measurement:** rerun paired sequences within one runner (at least five pairs / >=200 active rAF frames per arm), compare wheel active and commit p50/p95/p99/max, >100ms fraction, Chromium LayerTree/DrawFrame time, Konva scene/hit, trace bias, cache preparation and memory snapshots.
3. **Correctness:** DPR1/2 alpha/pixel-order parity, hit tests and selection, GIF animation pause/resume, 48 wheel cycles, board clear/reopen, media cache disposal, cross-session guest permissions and revoke. Maintain compatibility with current persisted formats, APIs and resource ownership.
4. **Acceptance:** propose the smallest renderer patch only if the intervention demonstrably improves **the same scene** without memory blowup or correctness regressions. If a renderer-layout change fails the controlled gate, investigate compositor tiling/viewport transforms; separately evaluate the remaining full input `validateBoardDocument` cost with trusted-state proofs.
5. **Scope:** C3.9-F multi-hour soak and pilot rollback follow after E3 release acceptance. Issue #201 remains open.

Source plans: [PLAN.md](../PLAN.md) and [E2 experimental contract](C39_E2_RENDER_RUN_ISOLATION_2026-10-10.md).
