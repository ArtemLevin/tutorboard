import { describe, expect, it } from "vitest";

import {
  createBoardSceneSelector,
  createPlotSamplingCache,
  deserializeBoardDocument,
  maximumSamplePointsPerCoordinatePlot,
  maximumSamplePointsPerSeries,
  maximumSamplingCacheEntries,
  maximumSamplingEvaluationsPerSeries,
  sampleCoordinatePlotDefinition,
  serializeBoardDocument,
} from "../../src/core/public";
import {
  createCoordinatePlotProductionDefinition,
  createCoordinatePlotProductionDocument,
} from "../fixtures/coordinate-plot-production";

const representativePlotCount = 16;
const onePlaneBudgetMs = 2_000;
const fullPageBudgetMs = 6_000;
const warmPageBudgetMs = 1_500;
const roundTripBudgetMs = 1_000;
const sceneBudgetMs = 1_000;

function sampleDefinition(
  definition: ReturnType<typeof createCoordinatePlotProductionDefinition>,
  cache = createPlotSamplingCache(),
) {
  return sampleCoordinatePlotDefinition({
    boardZoom: 1,
    cache,
    definition,
    pixelSize: definition.size,
  });
}

describe("coordinate plot production budgets", () => {
  it("samples one representative multi-series plane within numerical and time limits", () => {
    const definition = createCoordinatePlotProductionDefinition();
    const startedAt = performance.now();
    const result = sampleDefinition(definition);
    const elapsed = performance.now() - startedAt;

    expect(result.series).toHaveLength(definition.series.length);
    expect(result.truncated).toBe(false);
    expect(result.totalPointCount).toBeGreaterThan(500);
    expect(result.totalPointCount).toBeLessThanOrEqual(
      maximumSamplePointsPerCoordinatePlot,
    );
    for (const item of result.series) {
      if (item.sample === null) continue;
      expect(item.sample.metrics.pointCount).toBeLessThanOrEqual(
        maximumSamplePointsPerSeries,
      );
      expect(item.sample.metrics.evaluationCount).toBeLessThanOrEqual(
        maximumSamplingEvaluationsPerSeries,
      );
      expect(item.sample.stopReason).toBeNull();
    }
    expect(elapsed).toBeLessThan(onePlaneBudgetMs);
  });

  it("samples sixteen planes and reuses deterministic bounded caches", () => {
    const definitions = Array.from(
      { length: representativePlotCount },
      (_value, index) => createCoordinatePlotProductionDefinition(index),
    );
    const caches = definitions.map(() => createPlotSamplingCache());

    const coldStartedAt = performance.now();
    const cold = definitions.map((definition, index) =>
      sampleDefinition(definition, caches[index]),
    );
    const coldElapsed = performance.now() - coldStartedAt;

    const warmStartedAt = performance.now();
    const warm = definitions.map((definition, index) =>
      sampleDefinition(definition, caches[index]),
    );
    const warmElapsed = performance.now() - warmStartedAt;

    const visibleSeriesCount = definitions.reduce(
      (total, definition) =>
        total + definition.series.filter(({ visible }) => visible).length,
      0,
    );
    const coldPoints = cold.reduce(
      (total, result) => total + result.totalPointCount,
      0,
    );
    const warmPoints = warm.reduce(
      (total, result) => total + result.totalPointCount,
      0,
    );

    expect(cold.every(({ truncated }) => !truncated)).toBe(true);
    expect(coldPoints).toBeGreaterThan(8_000);
    expect(coldPoints).toBeLessThanOrEqual(
      representativePlotCount * maximumSamplePointsPerCoordinatePlot,
    );
    expect(warmPoints).toBe(coldPoints);
    expect(warm.reduce((total, result) => total + result.cacheHits, 0)).toBe(
      visibleSeriesCount,
    );
    expect(
      caches.every(
        ({ size }) =>
          size <= maximumSamplingCacheEntries && size <= visibleSeriesCount,
      ),
    ).toBe(true);
    expect(coldElapsed).toBeLessThan(fullPageBudgetMs);
    expect(warmElapsed).toBeLessThan(warmPageBudgetMs);
  });

  it("round-trips and selects a sixteen-plane document within release budgets", () => {
    const document = createCoordinatePlotProductionDocument(
      representativePlotCount,
    );

    const serializationStartedAt = performance.now();
    const serialized = serializeBoardDocument(document);
    expect(serialized.ok).toBe(true);
    if (!serialized.ok) throw new Error(serialized.issues[0]?.message);
    const restored = deserializeBoardDocument(serialized.json);
    const roundTripElapsed = performance.now() - serializationStartedAt;

    expect(restored.status).toBe("ok");
    if (restored.status !== "ok") throw new Error(restored.status);
    expect(restored.document).toEqual(document);
    expect(roundTripElapsed).toBeLessThan(roundTripBudgetMs);

    const selector = createBoardSceneSelector();
    const sceneStartedAt = performance.now();
    const scene = selector(restored.document);
    const sceneElapsed = performance.now() - sceneStartedAt;

    expect(scene.items).toHaveLength(representativePlotCount);
    expect(
      scene.items.every(({ object }) => object.kind === "math.coordinate-plot"),
    ).toBe(true);
    expect(sceneElapsed).toBeLessThan(sceneBudgetMs);
    selector.reset();
    expect(selector.cacheSize()).toBe(0);
  });
});
