import { describe, expect, it } from "vitest";

import {
  batchBoardRenderItems,
  createBoardSceneSelector,
  createBoardVisibilityIndex,
  groupId,
  readBoardDocument,
  selectBoardScene,
  selectVisibleBoardItems,
} from "../../../src/core/public";
import { loadBoardFixture, loadGeometryImportFixture } from "./helpers";

describe("board scene selector", () => {
  it("produces an ordered renderer read model without exposing the document", () => {
    const read = readBoardDocument(loadBoardFixture());
    expect(read.status).toBe("ok");
    if (read.status !== "ok") {
      return;
    }

    const scene = selectBoardScene(read.document);

    expect(scene.items.map(({ object }) => object.id)).toEqual(
      read.document.order,
    );
    expect(scene.items[0]?.transforms).toEqual([
      read.document.groups[groupId("group:example-01")]?.transform,
    ]);
    expect(Object.keys(scene).sort()).toEqual(["items", "viewport"]);
  });

  it("uses import transform and per-object override instead of root group state", () => {
    const raw = loadGeometryImportFixture();
    const imports = raw.geometryImports as Record<
      string,
      Record<string, unknown>
    >;
    imports["import:geometry-01"]!.visualOverrides = {
      "object:geometry-point-A": {
        rotation: 0,
        scale: { x: 1, y: 1 },
        translation: { x: 8, y: -3 },
      },
    };
    const read = readBoardDocument(raw);
    expect(read.status).toBe("ok");
    if (read.status !== "ok") {
      return;
    }

    const [item] = selectBoardScene(read.document).items;

    expect(item?.transforms).toEqual([
      expect.objectContaining({ translation: { x: 320, y: 180 } }),
      expect.objectContaining({ translation: { x: 8, y: -3 } }),
    ]);
  });

  it("reuses unchanged render items and bounds its cache to the current document", () => {
    const read = readBoardDocument(loadBoardFixture());
    expect(read.status).toBe("ok");
    if (read.status !== "ok") {
      return;
    }
    const selector = createBoardSceneSelector();
    const first = selector(read.document);
    const changed = {
      ...read.document,
      title: "Changed without touching objects",
    };
    const second = selector(changed);
    expect(second).not.toBe(first);
    expect(second.items[0]).toBe(first.items[0]);
    expect(selector.cacheSize()).toBe(changed.order.length);

    const empty = {
      ...changed,
      objects: {},
      order: [],
    };
    expect(selector(empty).items).toEqual([]);
    expect(selector.cacheSize()).toBe(0);
    selector.reset();
    expect(selector.cacheSize()).toBe(0);
  });


  it("preserves legacy culling for wheel/pan, transformed and hidden objects", () => {
    const read = readBoardDocument(loadBoardFixture());
    expect(read.status).toBe("ok");
    if (read.status !== "ok") return;

    const items = selectBoardScene(read.document).items;
    const index = createBoardVisibilityIndex(items);
    const size = { width: 460, height: 290, overscan: 0 };
    for (const viewport of [
      { offset: { x: 0, y: 0 }, zoom: 1 },
      { offset: { x: -200, y: -170 }, zoom: 1.4 },
      { offset: { x: 260, y: 130 }, zoom: 0.3 },
      { offset: { x: -10_000, y: -10_000 }, zoom: 2 },
      { offset: { x: 0, y: 0 }, zoom: 1 },
    ]) {
      expect(index.select(viewport, size)).toEqual(
        selectVisibleBoardItems(items, viewport, size),
      );
    }

    const hidden = items.map((item, position) =>
      position === 0
        ? { ...item, object: { ...item.object, visible: false } }
        : item,
    );
    const hiddenIndex = createBoardVisibilityIndex(hidden);
    expect(hiddenIndex.select(read.document.viewport, size)).toEqual(
      selectVisibleBoardItems(hidden, read.document.viewport, size),
    );
  });

  it("retains visible references only while membership and order are stable", () => {
    const read = readBoardDocument(loadBoardFixture());
    expect(read.status).toBe("ok");
    if (read.status !== "ok") return;
    const items = selectBoardScene(read.document).items;
    const index = createBoardVisibilityIndex(items);
    const size = { width: 10_000, height: 10_000, overscan: 0 };
    const original = index.select(read.document.viewport, size);
    expect(original.length).toBeGreaterThan(0);
    expect(index.select(read.document.viewport, size)).toBe(original);
    expect(
      index.select({ offset: { x: -5, y: -7 }, zoom: 1.01 }, size),
    ).toBe(original);

    const emptyViewport = {
      offset: { x: -1_000_000, y: -1_000_000 },
      zoom: 1,
    };
    const empty = index.select(emptyViewport, size);
    expect(empty).toHaveLength(0);
    expect(empty).not.toBe(original);
    expect(index.select(emptyViewport, size)).toBe(empty);

    const changedItem = {
      ...items[0]!,
      object: {
        ...items[0]!.object,
        position: { x: 1_000_000, y: 1_000_000 },
      },
    };
    const modified = [changedItem, ...items.slice(1)];
    const modifiedIndex = createBoardVisibilityIndex(modified);
    expect(modifiedIndex.select(read.document.viewport, size)).toEqual(
      selectVisibleBoardItems(modified, read.document.viewport, size),
    );
    expect(modifiedIndex.select(read.document.viewport, size)).not.toBe(
      original,
    );
  });

  it("culls hidden and offscreen items before stable render batching", () => {
    const read = readBoardDocument(loadBoardFixture());
    expect(read.status).toBe("ok");
    if (read.status !== "ok") {
      return;
    }
    const scene = selectBoardScene(read.document);
    const visible = selectVisibleBoardItems(
      scene.items,
      { offset: { x: 0, y: 0 }, zoom: 1 },
      { height: 100, overscan: 0, width: 100 },
    );
    expect(visible.length).toBeLessThanOrEqual(scene.items.length);
    expect(visible.every(({ object }) => object.visible)).toBe(true);
    expect(batchBoardRenderItems(scene.items, 1)).toHaveLength(
      scene.items.length,
    );
    expect(() => batchBoardRenderItems(scene.items, 0)).toThrow(RangeError);
  });
});
