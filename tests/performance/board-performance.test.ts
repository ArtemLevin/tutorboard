import { describe, expect, it } from "vitest";

import {
  boardObjectId,
  compilePlotExpression,
  createBoardSceneSelector,
  createBoardSceneSpatialIndex,
  createBoardVisibilityIndex,
  deriveBoardSceneDelta,
  createEmptyBoardDocument,
  documentId,
  sampleExplicitSeries,
  selectVisibleBoardItems,
  type BoardDocument,
  type RectangleObject,
} from "../../src/core/public";

const objectCount = 5_000;

function largeDocument(seed = 0, count = objectCount): BoardDocument {
  const base = createEmptyBoardDocument({
    createdAt: "2026-07-24T12:00:00.000Z",
    id: documentId(`document:performance-${seed}`),
    title: "Representative large board",
  });
  const objects: Record<string, RectangleObject> = {};
  const order = Array.from({ length: count }, (_value, index) => {
    const id = boardObjectId(`object:performance-${seed}-${index}`);
    objects[id] = {
      groupId: null,
      id,
      kind: "drawing.rectangle",
      locked: false,
      position: {
        x: (index % 100) * 140,
        y: Math.floor(index / 100) * 100,
      },
      rotation: 0,
      scale: { x: 1, y: 1 },
      source: { kind: "user" },
      style: {
        fill: null,
        opacity: 1,
        stroke: "#17202a",
        strokeWidth: 2,
      },
      visible: true,
      size: { height: 80, width: 120 },
    };
    return id;
  });
  return { ...base, objects, order };
}

describe("Phase 3 performance budgets", () => {
  it("selects and culls a representative 5k-object document within CI budgets", () => {
    const selector = createBoardSceneSelector();
    const document = largeDocument();
    const initialStart = performance.now();
    const initial = selector(document);
    const initialMilliseconds = performance.now() - initialStart;

    const cullingStart = performance.now();
    const visible = selectVisibleBoardItems(
      initial.items,
      { offset: { x: 0, y: 0 }, zoom: 1 },
      { height: 900, width: 1_600 },
    );
    const cullingMilliseconds = performance.now() - cullingStart;

    const changedId = document.order[2_500]!;
    const changedObject = document.objects[changedId]!;
    const changed = {
      ...document,
      objects: {
        ...document.objects,
        [changedId]: {
          ...changedObject,
          position: { x: changedObject.position.x + 1, y: 0 },
        },
      },
    };
    const incrementalStart = performance.now();
    const incremental = selector(changed);
    const incrementalMilliseconds = performance.now() - incrementalStart;

    expect(initial.items).toHaveLength(objectCount);
    expect(visible.length).toBeGreaterThan(0);
    expect(visible.length).toBeLessThan(300);
    expect(incremental.items[0]).toBe(initial.items[0]);
    expect(incremental.items[2_500]).not.toBe(initial.items[2_500]);
    expect(initialMilliseconds).toBeLessThan(1_000);
    expect(cullingMilliseconds).toBeLessThan(1_000);
    expect(incrementalMilliseconds).toBeLessThan(500);
  });

  it("reuses immutable scene geometry across 5k-object wheel sequences", () => {
    const scene = createBoardSceneSelector()(largeDocument());
    const size = { height: 900, width: 1_600 };
    const viewports = Array.from({ length: 24 }, (_value, index) => ({
      offset: { x: -index * 17, y: -index * 11 },
      zoom: 1 + index * 0.009,
    }));
    const visibilityIndex = createBoardVisibilityIndex(scene.items);
    const initial = visibilityIndex.select(viewports[0]!, size);
    expect(visibilityIndex.select(viewports[0]!, size)).toBe(initial);

    const uncachedStart = performance.now();
    const legacy = viewports.map((viewport) =>
      selectVisibleBoardItems(scene.items, viewport, size),
    );
    const uncachedMs = performance.now() - uncachedStart;

    const indexedStart = performance.now();
    const indexed = viewports.map((viewport) =>
      visibilityIndex.select(viewport, size),
    );
    const indexedMs = performance.now() - indexedStart;

    for (let index = 0; index < viewports.length; index += 1) {
      expect(indexed[index]).toEqual(legacy[index]);
    }
    expect(indexedMs).toBeLessThan(1_000);
    console.info(
      "VIEWPORT_CULLING_PROFILE",
      JSON.stringify({
        objects: scene.items.length,
        wheelFrames: viewports.length,
        uncachedMs,
        indexedMs,
        indexedToUncachedRatio: indexedMs / Math.max(uncachedMs, 0.001),
      }),
    );
  });

  it("derives a single-item delta in a 5k immutable scene", () => {
    const selector = createBoardSceneSelector();
    const base = largeDocument(91);
    const previousScene = selector(base);
    const id = base.order[2_500]!;
    const object = base.objects[id]!;
    const updated = {
      ...base,
      objects: {
        ...base.objects,
        [id]: {
          ...object,
          position: { x: object.position.x + 1, y: object.position.y },
        },
      },
    };
    const nextScene = selector(updated);
    const startedAt = performance.now();
    const delta = deriveBoardSceneDelta({
      previousDocument: base,
      previousScene,
      nextDocument: updated,
      nextScene,
    });
    const elapsedMs = performance.now() - startedAt;

    expect(delta.kind).toBe("patch");
    expect(delta.changedIds).toEqual([id]);
    expect(delta.updated).toHaveLength(1);
    // Shared-runner regression guard, not an ICE frame-latency improvement.
    expect(elapsedMs).toBeLessThan(500);
  });

  it.each([5_000, 10_000])(
    "profiles spatial query parity and bulk patches for %i objects",
    (count) => {
      const base = largeDocument(92, count);
      const selector = createBoardSceneSelector();
      const before = selector(base);
      const reference = createBoardVisibilityIndex(before.items);
      const spatial = createBoardSceneSpatialIndex(before);
      const size = { height: 900, width: 1_600 };
      const views = Array.from({ length: 48 }, (_value, index) => ({
        offset: { x: -index * 170, y: -index * 75 },
        zoom: 0.5 + (index % 8) * 0.25,
      }));
      // Warm both candidates and check exact object identity and z-order.
      for (const view of views) {
        const expected = reference.select(view, size);
        const actual = spatial.queryViewport(view, size);
        expect(actual).toHaveLength(expected.length);
        expect(actual.every((item, i) => item === expected[i])).toBe(true);
      }
      const referenceStart = performance.now();
      for (const view of views) reference.select(view, size);
      const referenceMs = performance.now() - referenceStart;
      const spatialStart = performance.now();
      for (const view of views) spatial.queryViewport(view, size);
      const spatialMs = performance.now() - spatialStart;

      const objects = { ...base.objects };
      for (const id of base.order.slice(0, count / 2)) {
        const object = objects[id]!;
        objects[id] = {
          ...object,
          position: { x: object.position.x + 512, y: object.position.y },
        };
      }
      const next = { ...base, objects };
      const after = selector(next);
      const delta = deriveBoardSceneDelta({
        previousDocument: base,
        previousScene: before,
        nextDocument: next,
        nextScene: after,
      });
      expect(delta.updated).toHaveLength(count / 2);
      const patchStart = performance.now();
      const result = spatial.apply(delta, after);
      const patchMs = performance.now() - patchStart;
      expect(result).toBe("patch");
      const updatedReference = createBoardVisibilityIndex(after.items);
      for (const view of views) {
        const expected = updatedReference.select(view, size);
        const actual = spatial.queryViewport(view, size);
        expect(actual).toHaveLength(expected.length);
        expect(actual.every((item, i) => item === expected[i])).toBe(true);
      }
      expect(spatial.stats().items).toBe(count);
      expect(spatial.stats().bucketReferences).toBeLessThanOrEqual(count * 64);
      console.info(
        "ICE2_SPATIAL_PROFILE",
        JSON.stringify({ count, referenceMs, spatialMs, patchMs }),
      );
      spatial.dispose();
      expect(spatial.stats().items).toBe(0);
      expect(spatial.stats().bucketReferences).toBe(0);
    },
  );

  it.each([5_000, 10_000])(
    "records paired ABBA culling profiles at %i objects",
    (count) => {
      for (const density of ["spread", "dense"] as const) {
        const base = largeDocument(93, count);
        const objects = { ...base.objects };
        if (density === "dense") {
          for (const id of base.order) {
            const object = objects[id]!;
            objects[id] = {
              ...object,
              position: {
                x: object.position.x / 8,
                y: object.position.y / 8,
              },
            };
          }
        }
        const scene = createBoardSceneSelector()({ ...base, objects });
        const reference = createBoardVisibilityIndex(scene.items);
        const spatial = createBoardSceneSpatialIndex(scene);
        const size = { height: 900, width: 1_600 };
        const views = Array.from({ length: 48 }, (_value, i) => ({
          offset: {
            x: -((i % 12) * (density === "dense" ? 75 : 340)),
            y: -(Math.floor(i / 12) * 160),
          },
          zoom: 0.5 + (i % 8) * 0.25,
        }));
        type Query = () => number;
        const queryReference: Query = () => {
          let total = 0;
          for (const view of views)
            total += reference.select(view, size).length;
          return total;
        };
        const querySpatial: Query = () => {
          let total = 0;
          for (const view of views)
            total += spatial.queryViewport(view, size).length;
          return total;
        };
        for (const view of views) {
          const expected = reference.select(view, size);
          const actual = spatial.queryViewport(view, size);
          expect(actual).toHaveLength(expected.length);
          expect(actual.every((item, i) => item === expected[i])).toBe(true);
        }
        const expectedTotal = queryReference();
        for (let i = 0; i < 6; i += 1) {
          expect(queryReference()).toBe(expectedTotal);
          expect(querySpatial()).toBe(expectedTotal);
        }
        const referenceSamples: number[] = [];
        const spatialSamples: number[] = [];
        function measure(query: Query, samples: number[]): void {
          const start = performance.now();
          const total = query();
          samples.push(performance.now() - start);
          expect(total).toBe(expectedTotal);
        }
        // Balance first/last position and preserve all samples, including GC.
        for (let i = 0; i < 10; i += 1) {
          if (i % 2 === 0) {
            measure(queryReference, referenceSamples);
            measure(querySpatial, spatialSamples);
            measure(querySpatial, spatialSamples);
            measure(queryReference, referenceSamples);
          } else {
            measure(querySpatial, spatialSamples);
            measure(queryReference, referenceSamples);
            measure(queryReference, referenceSamples);
            measure(querySpatial, spatialSamples);
          }
        }
        function summarize(samples: readonly number[]) {
          const sorted = [...samples].sort((a, b) => a - b);
          const quantile = (q: number) =>
            sorted[Math.ceil(q * sorted.length) - 1]!;
          return {
            p50: quantile(0.5),
            p95: quantile(0.95),
            max: sorted.at(-1),
          };
        }
        console.info(
          "ICE2_SPATIAL_ABBA",
          JSON.stringify({
            count,
            density,
            queriesPerSample: views.length,
            reference: summarize(referenceSamples),
            spatial: summarize(spatialSamples),
            referenceSamples,
            spatialSamples,
            totalVisiblePerSample: expectedTotal,
            stats: spatial.stats(),
          }),
        );
        spatial.dispose();
        expect(spatial.stats().items).toBe(0);
        expect(spatial.stats().bucketReferences).toBe(0);
      }
    },
    60_000,
  );

  it("does not retain previously opened large documents", () => {
    const selector = createBoardSceneSelector();
    for (let index = 0; index < 8; index += 1) {
      selector(largeDocument(index));
      expect(selector.cacheSize()).toBe(objectCount);
    }
    selector.reset();
    expect(selector.cacheSize()).toBe(0);
  });

  it("samples a high-detail coordinate curve within bounded CI budgets", () => {
    const compiled = compilePlotExpression("sin(20*x)/(1+x^2)", {
      context: "explicit-function",
      parameterNames: [],
    });
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) throw new Error(compiled.diagnostics[0]?.message);

    const startedAt = performance.now();
    const sample = sampleExplicitSeries({
      boardZoom: 2,
      domain: { max: 20, min: -20 },
      expression: compiled.expression,
      parameters: {},
      pixelSize: { height: 720, width: 1_280 },
      viewport: { xMax: 20, xMin: -20, yMax: 2, yMin: -2 },
    });
    const elapsed = performance.now() - startedAt;

    expect(sample.stopReason).toBeNull();
    expect(sample.metrics.pointCount).toBeGreaterThan(200);
    expect(sample.metrics.pointCount).toBeLessThanOrEqual(12_000);
    expect(sample.metrics.evaluationCount).toBeLessThanOrEqual(50_000);
    expect(elapsed).toBeLessThan(1_000);
  });
});
