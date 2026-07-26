import { describe, expect, it } from "vitest";

import {
  batchBoardRenderItems,
  createBoardSceneSelector,
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
