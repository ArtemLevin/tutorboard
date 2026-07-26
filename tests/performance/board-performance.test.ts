import { describe, expect, it } from "vitest";

import {
  boardObjectId,
  createBoardSceneSelector,
  createEmptyBoardDocument,
  documentId,
  selectVisibleBoardItems,
  type BoardDocument,
  type RectangleObject,
} from "../../src/core/public";

const objectCount = 5_000;

function largeDocument(seed = 0): BoardDocument {
  const base = createEmptyBoardDocument({
    createdAt: "2026-07-24T12:00:00.000Z",
    id: documentId(`document:performance-${seed}`),
    title: "Representative large board",
  });
  const objects: Record<string, RectangleObject> = {};
  const order = Array.from({ length: objectCount }, (_value, index) => {
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

  it("does not retain previously opened large documents", () => {
    const selector = createBoardSceneSelector();
    for (let index = 0; index < 8; index += 1) {
      selector(largeDocument(index));
      expect(selector.cacheSize()).toBe(objectCount);
    }
    selector.reset();
    expect(selector.cacheSize()).toBe(0);
  });
});
