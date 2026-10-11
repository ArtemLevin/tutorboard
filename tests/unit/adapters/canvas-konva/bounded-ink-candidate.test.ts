import { describe, expect, it, vi } from "vitest";
import { readBoardDocument, selectBoardScene, selectVisibleBoardItems, type BoardRenderItem } from "../../../src/core/public";
import { createDenseBoardDocument } from "../../fixtures/dense-board";
import { selectBoundedInkCandidate } from "../../../src/adapters/canvas-konva/bounded-ink-candidate";
import {
  estimateInkRasterCost,
  maximumSharedInkCanvasBytes,
  maximumSharedInkScenePixels,
  SharedInkRasterBudget,
} from "../../../src/adapters/canvas-konva/shared-ink-raster-budget";
import { WheelInkCacheCoordinator } from "../../../src/adapters/canvas-konva/wheel-ink-cache";

function visibleFixture(strokes: number, visible: number) {
  const raw = createDenseBoardDocument({
    strokeCount: strokes,
    visibleStrokeCount: visible,
    staticCount: 10,
    gifCount: 0,
    strokeGeometry: "varied",
    zOrderPattern: "trailing",
    staticImageFormats: [
      "png", "png", "png", "png",
      "jpg", "jpeg", "jpg", "jpeg", "jpg", "jpeg",
    ],
  });
  const result = readBoardDocument(raw);
  expect(result.status).toBe("ok");
  if (result.status !== "ok") throw new Error("Invalid C3.9 static fixture");
  const scene = selectBoardScene(result.document);
  const visibleItems = selectVisibleBoardItems(
    scene.items,
    result.document.viewport,
    { width: 1240, height: 820 },
  );
  return { raw, scene: visibleItems };
}

describe("S5.2 exact-geometry bounded pen candidate", () => {
  it.each([
    [5000, 4000],
    [10000, 8000],
  ])("checks the actual C3.9 %i-stroke plus ten-image geometry", (strokes, visible) => {
    const { raw, scene } = visibleFixture(strokes, visible);
    const candidate = selectBoundedInkCandidate(scene, 2);
    const evidence = {
      requestedStrokes: strokes,
      requestedVisibleStrokes: visible,
      visibleItems: scene.length,
      images: raw.order.filter((id) => id.includes(":image:")).length,
      count: candidate?.objectIds.length ?? 0,
      crop: candidate?.crop ?? null,
      scenePixels: candidate?.cost.scenePixels ?? 0,
      totalBytes: candidate?.cost.accountedBytes ?? 0,
    };
    console.info("C39_S5_S2_ELIGIBILITY " + JSON.stringify(evidence));
    expect(evidence.images).toBe(10);
    expect(candidate).not.toBeNull();
    if (candidate === null) return;
    expect(candidate.objectIds.length).toBeGreaterThanOrEqual(80);
    expect(candidate.objectIds.length).toBeLessThanOrEqual(256);
    expect(candidate.cost.scenePixels).toBeLessThanOrEqual(maximumSharedInkScenePixels);
    expect(candidate.cost.accountedBytes).toBeLessThanOrEqual(maximumSharedInkCanvasBytes);
    expect(
      scene.slice(candidate.startIndex, candidate.endIndexExclusive).map((item) => item.object.id),
    ).toEqual(candidate.objectIds);
    expect(scene.slice(candidate.startIndex, candidate.endIndexExclusive)
      .every((item) => item.object.kind === "drawing.pen-stroke")).toBe(true);
  });

  it("preserves exact positions around a pen-image-pen boundary", () => {
    const { scene } = visibleFixture(5000, 4000);
    const ink = scene.filter((item) => item.object.kind === "drawing.pen-stroke");
    const image = scene.find((item) => item.object.kind === "image.embedded");
    expect(image).toBeDefined();
    const mixed = [...ink.slice(0, 50), image!, ...ink.slice(50, 200)];
    const candidate = selectBoundedInkCandidate(mixed, 1);
    expect(candidate).not.toBeNull();
    expect(candidate?.startIndex).toBeGreaterThanOrEqual(51);
    expect(candidate?.objectIds).not.toContain(image!.object.id);
  });

  it("falls back for nonpen, unsupported style/transform, invalid DPR and insufficient strokes", () => {
    const { scene } = visibleFixture(5000, 4000);
    const ink = scene.filter((item) => item.object.kind === "drawing.pen-stroke");
    expect(selectBoundedInkCandidate(ink.slice(0, 79), 2)).toBeNull();
    expect(selectBoundedInkCandidate(ink.slice(0, 140), Number.NaN)).toBeNull();
    expect(selectBoundedInkCandidate(ink.slice(0, 140), 3)).toBeNull();
    const changed = ink.slice(0, 140).map((item) => ({
      ...item,
      transforms: [{ rotation: 12, scale: { x: 1, y: 1 }, translation: { x: 0, y: 0 } }],
    })) satisfies BoardRenderItem[];
    expect(selectBoundedInkCandidate(changed, 2)).toBeNull();
    const unknownStyle = ink.slice(0, 140).map((item) => ({
      ...item,
      object: { ...item.object, style: { ...item.object.style, strokeStyle: "wavy" as const } },
    })) satisfies BoardRenderItem[];
    expect(selectBoundedInkCandidate(unknownStyle, 2)).toBeNull();
  });

  it("limits a far-away or unbounded group to explicit vector fallback", () => {
    const { scene } = visibleFixture(5000, 4000);
    const ink = scene.filter((item) => item.object.kind === "drawing.pen-stroke");
    const distant = ink.slice(0, 100).map((item, index) => ({
      ...item,
      object: {
        ...item.object,
        position: { x: index * 100_000, y: index * 100_000 },
      },
    })) satisfies BoardRenderItem[];
    expect(selectBoundedInkCandidate(distant, 2)).toBeNull();
  });
});

describe("S5.2 shared scene/hit/scratch leasing", () => {
  it("accounts scene, hit and temporary scratch before acquisition", () => {
    const measured = estimateInkRasterCost({
      width: 256, height: 256, scenePixelRatio: 2, hitPixelRatio: 1,
    });
    expect(measured).not.toBeNull();
    expect(measured?.scenePixels).toBe(262144);
    expect(measured?.hitPixels).toBe(65536);
    expect(measured?.scratchPixels).toBe(327680);
    expect(measured?.accountedBytes).toBe(2621440);
    expect(estimateInkRasterCost({
      width: 256, height: 256, scenePixelRatio: 3, hitPixelRatio: 1,
    })).toBeNull();
    expect(estimateInkRasterCost({
      width: Number.POSITIVE_INFINITY, height: 2, scenePixelRatio: 1, hitPixelRatio: 1,
    })).toBeNull();
  });

  it("prevents overbudget and double spatial ownership while allowing wheel + spatial", () => {
    const budget = new SharedInkRasterBudget();
    const region = { width: 256, height: 256, scenePixelRatio: 2, hitPixelRatio: 1 };
    const wheel = budget.tryAcquire("wheel", region);
    const tile = budget.tryAcquire("spatial", region);
    expect(wheel).not.toBeNull();
    expect(tile).not.toBeNull();
    expect(budget.tryAcquire("spatial", region)).toBeNull();
    expect(budget.activeLeases).toBe(2);
    expect(budget.wheelLeases).toBe(1);
    expect(budget.spatialLeases).toBe(1);
    expect(budget.peakBytes).toBeGreaterThan(0);
    const huge = budget.tryAcquire("wheel", {
      width: 1400, height: 1400, scenePixelRatio: 2, hitPixelRatio: 1,
    });
    expect(huge).toBeNull();
    wheel?.release();
    wheel?.release();
    expect(budget.activeLeases).toBe(1);
    budget.releaseAll();
    expect(budget.activeLeases).toBe(0);
    expect(budget.scenePixels).toBe(0);
    expect(budget.accountedBytes).toBe(0);
  });

  it("uses the same optional lease pool in existing WheelInkCacheCoordinator", () => {
    const budget = new SharedInkRasterBudget();
    const coordinator = new WheelInkCacheCoordinator(budget);
    const cache = vi.fn();
    const clearCache = vi.fn();
    const node = {
      cache, clearCache,
      getClientRect: () => ({ x: 0, y: 0, width: 800, height: 400 }),
      getLayer: () => ({ batchDraw: vi.fn() }),
    };
    coordinator.register(node);
    coordinator.begin(2);
    expect(cache).toHaveBeenCalledOnce();
    expect(budget.wheelLeases).toBe(1);
    expect(budget.scenePixels).toBeGreaterThan(0);
    coordinator.end();
    expect(clearCache).toHaveBeenCalledOnce();
    expect(budget.accountedBytes).toBe(0);
    coordinator.dispose();
  });

  it("refuses a wheel cache when the shared budget is occupied; vector fallback remains", () => {
    const budget = new SharedInkRasterBudget();
    const reservation = budget.tryAcquire("spatial", {
      width: 900, height: 400, scenePixelRatio: 2, hitPixelRatio: 1,
    });
    expect(reservation).not.toBeNull();
    const coordinator = new WheelInkCacheCoordinator(budget);
    const cache = vi.fn();
    coordinator.register({
      cache,
      clearCache: vi.fn(),
      getClientRect: () => ({ x: 0, y: 0, width: 950, height: 400 }),
      getLayer: () => null,
    });
    coordinator.begin(2);
    expect(cache).not.toHaveBeenCalled();
    expect(coordinator.cachedCount).toBe(0);
    expect(coordinator.lastBuildSkippedRuns).toBe(1);
    coordinator.dispose();
    reservation?.release();
    expect(budget.accountedBytes).toBe(0);
  });
});
