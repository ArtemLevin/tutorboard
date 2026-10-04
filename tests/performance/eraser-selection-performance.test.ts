import { describe, expect, it } from "vitest";

import {
  boardObjectId,
  defaultViewport,
  type BoardObject,
  type BoardSceneReadModel,
} from "../../src/core/public";
import { selectObjectIdsNearPath } from "../../src/modules/selection/public";

const sparseObjectCount = 5_000;
const denseObjectCount = 1_000;
const sparseLongPathBudgetMs = 120;
const densePathBudgetMs = 500;

const style = {
  fill: null,
  opacity: 1,
  stroke: "#17202a",
  strokeWidth: 2,
} as const;

function rectangle(
  id: string,
  x: number,
  y: number,
  width = 120,
  height = 80,
): Extract<BoardObject, { kind: "drawing.rectangle" }> {
  return {
    groupId: null,
    id: boardObjectId(id),
    kind: "drawing.rectangle",
    locked: false,
    position: { x, y },
    rotation: 0,
    scale: { x: 1, y: 1 },
    size: { height, width },
    source: { kind: "user" },
    style,
    visible: true,
  };
}

function sparseScene(): BoardSceneReadModel {
  return {
    items: Array.from({ length: sparseObjectCount }, (_value, index) => ({
      object: rectangle(
        `object:eraser-sparse-${index}`,
        (index % 100) * 180,
        Math.floor(index / 100) * 140,
      ),
      transforms: [],
    })),
    viewport: defaultViewport,
  };
}

function denseScene(): BoardSceneReadModel {
  return {
    items: Array.from({ length: denseObjectCount }, (_value, index) => ({
      object: rectangle(
        `object:eraser-dense-${index}`,
        (index % 50) * 20,
        Math.floor(index / 50) * 20,
        36,
        36,
      ),
      transforms: [],
    })),
    viewport: defaultViewport,
  };
}

function straightPath(pointCount: number) {
  return Array.from({ length: pointCount }, (_value, index) => ({
    x: -40 + (1_160 * index) / Math.max(1, pointCount - 1),
    y: 40,
  }));
}

function densePath(pointCount: number) {
  return Array.from({ length: pointCount }, (_value, index) => ({
    x: -20 + (1_060 * index) / Math.max(1, pointCount - 1),
    y: 200 + Math.sin(index / 4) * 30,
  }));
}

function medianElapsedMs(
  scene: BoardSceneReadModel,
  path: readonly { readonly x: number; readonly y: number }[],
  tolerance: number,
): { readonly hits: readonly string[]; readonly medianMs: number } {
  for (let warmup = 0; warmup < 2; warmup += 1) {
    selectObjectIdsNearPath(scene, path, tolerance);
  }

  const elapsed: number[] = [];
  let hits: readonly string[] = [];
  for (let sample = 0; sample < 5; sample += 1) {
    const startedAt = performance.now();
    hits = selectObjectIdsNearPath(scene, path, tolerance);
    elapsed.push(performance.now() - startedAt);
  }
  elapsed.sort((left, right) => left - right);
  return { hits, medianMs: elapsed[Math.floor(elapsed.length / 2)]! };
}

describe("eraser broad-phase performance", () => {
  it("keeps a 5k sparse board bounded as path sampling becomes denser", () => {
    const scene = sparseScene();
    const short = medianElapsedMs(scene, straightPath(10), 12);
    const long = medianElapsedMs(scene, straightPath(100), 12);

    expect(long.hits).toEqual(short.hits);
    expect(long.hits.length).toBeGreaterThan(0);
    expect(long.hits.length).toBeLessThan(20);
    expect(long.medianMs).toBeLessThan(sparseLongPathBudgetMs);
    expect(long.medianMs).toBeLessThanOrEqual(short.medianMs * 6 + 25);
  });

  it("preserves bounded behavior when broad-phase has many candidates", () => {
    const scene = denseScene();
    const result = medianElapsedMs(scene, densePath(100), 12);

    expect(result.hits.length).toBeGreaterThan(20);
    expect(result.medianMs).toBeLessThan(densePathBudgetMs);
  });
});
