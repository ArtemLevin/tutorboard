import { describe, expect, it } from "vitest";

import {
  createBoardSceneSelector,
  readBoardDocument,
  selectBoardScene,
  type BoardDocument,
} from "../../../src/core/public";
import { createDenseBoardDocument } from "../../fixtures/dense-board";

function fixture(strokeCount = 12): BoardDocument {
  const result = readBoardDocument(
    createDenseBoardDocument({ strokeCount, staticCount: 2 }),
  );
  if (result.status !== "ok") {
    throw new Error(`Dense board fixture is invalid: ${result.status}`);
  }
  return result.document;
}

describe("C3.9-S6 viewport-only scene selector", () => {
  it("retains ordered render items and cached identity across consecutive viewport commits", () => {
    const selector = createBoardSceneSelector();
    const original = fixture();
    const first = selector(original);
    expect(selector(original)).toBe(first);

    const shifted: BoardDocument = {
      ...original,
      updatedAt: "2026-10-11T14:00:00.000Z",
      viewport: { offset: { x: 23, y: 41 }, zoom: 1.25 },
    };
    const second = selector(shifted);
    expect(second).not.toBe(first);
    expect(second.viewport).toBe(shifted.viewport);
    expect(second.items).toBe(first.items);
    expect(selector.cacheSize()).toBe(original.order.length);
    expect(selector(shifted)).toBe(second);

    const zoomed: BoardDocument = {
      ...shifted,
      updatedAt: "2026-10-11T14:00:01.000Z",
      viewport: { offset: { x: -8, y: 19 }, zoom: 2 },
    };
    const third = selector(zoomed);
    expect(third.items).toBe(first.items);
    expect(third.viewport).toBe(zoomed.viewport);
    expect(third).toEqual(selectBoardScene(zoomed));
  });

  it("invalidates on content, order, metadata, group and import replacement", () => {
    const original = fixture();
    const changes: readonly BoardDocument[] = [
      { ...original, objects: { ...original.objects } },
      { ...original, order: [...original.order].reverse() },
      { ...original, groups: { ...original.groups } },
      { ...original, geometryImports: { ...original.geometryImports } },
      { ...original, solidModels: { ...original.solidModels } },
      {
        ...original,
        solidLearningAttempts: { ...original.solidLearningAttempts },
      },
      { ...original, title: "Renamed board" },
      { ...original, id: original.id },
    ];
    // A different document object alone is safe; the selector must allow
    // viewport-only reuse even when updatedAt changes.
    const selector = createBoardSceneSelector();
    const first = selector(original);
    for (const changed of changes.slice(0, -1)) {
      const preceding = selector(original);
      const next = selector(changed);
      expect(next.items).not.toBe(preceding.items);
      expect(next).toEqual(selectBoardScene(changed));
      expect(preceding.items).not.toBe(next.items);
    }
    expect(selector(original).items).not.toBe(first.items);
  });

  it("reuses no stale references after reset or a z-order edit", () => {
    const selector = createBoardSceneSelector();
    const original = fixture();
    const first = selector(original);
    const changed: BoardDocument = {
      ...original,
      order: [...original.order].reverse(),
      viewport: { offset: { x: 5, y: 5 }, zoom: 1.5 },
    };
    const reordered = selector(changed);
    expect(reordered.items).not.toBe(first.items);
    expect(reordered.items.map(({ object }) => object.id)).toEqual(
      changed.order,
    );
    selector.reset();
    expect(selector.cacheSize()).toBe(0);
    const restored = selector(original);
    expect(restored.items).not.toBe(first.items);
    expect(restored).toEqual(selectBoardScene(original));
  });

  it("avoids rebuilding 5k render items for a viewport-only revision", () => {
    const original = fixture(5_000);
    const selector = createBoardSceneSelector();
    const base = selector(original);
    const next = selector({
      ...original,
      viewport: { offset: { x: 150, y: 25 }, zoom: 1.08 },
    });
    expect(next.items).toBe(base.items);
    expect(next.items).toHaveLength(5_002);
    expect(selector.cacheSize()).toBe(5_002);
  });
});
