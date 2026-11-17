import { describe, expect, it } from "vitest";

import {
  boardObjectId,
  createBoardSceneSelector,
  createEmptyBoardDocument,
  deriveBoardSceneDelta,
  documentId,
  type BoardDocument,
  type BoardObjectId,
  type RectangleObject,
} from "../../../src/core/public";

const firstId = boardObjectId("object:ice2-rectangle-a");
const secondId = boardObjectId("object:ice2-rectangle-b");
const thirdId = boardObjectId("object:ice2-rectangle-c");

function rectangle(
  id: BoardObjectId,
  x = 0,
): RectangleObject {
  return {
    id,
    kind: "drawing.rectangle",
    groupId: null,
    locked: false,
    position: { x, y: 10 },
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
    size: { width: 60, height: 40 },
  };
}

function document(): BoardDocument {
  const base = createEmptyBoardDocument({
    createdAt: "2026-11-17T09:00:00.000Z",
    id: documentId("document:ice2-scene-delta"),
    title: "ICE 2.0 scene delta",
  });
  return {
    ...base,
    objects: {
      [firstId]: rectangle(firstId),
      [secondId]: rectangle(secondId, 100),
    },
    order: [firstId, secondId],
  };
}

describe("ICE 2.0 renderer-neutral SceneDelta", () => {
  it("requires a complete rebuild for the initial scene", () => {
    const base = document();
    const scene = createBoardSceneSelector()(base);
    const delta = deriveBoardSceneDelta({
      previousDocument: null,
      previousScene: null,
      nextDocument: base,
      nextScene: scene,
    });
    expect(delta.kind).toBe("reset");
    expect(delta.reason).toBe("initial");
    expect(delta.added).toEqual(scene.items);
    expect(delta.changedIds).toEqual(base.order);
  });

  it("separates pure camera changes from content changes", () => {
    const base = document();
    const selector = createBoardSceneSelector();
    const before = selector(base);
    const moved = {
      ...base,
      viewport: {
        offset: { x: -45, y: 22 },
        zoom: 1.5,
      },
    };
    const after = selector(moved);
    const delta = deriveBoardSceneDelta({
      previousDocument: base,
      previousScene: before,
      nextDocument: moved,
      nextScene: after,
    });

    expect(delta.kind).toBe("camera");
    expect(delta.viewportChanged).toBe(true);
    expect(delta.changedIds).toEqual([]);
    expect(delta.added).toHaveLength(0);
    expect(delta.updated).toHaveLength(0);

    const renamed = { ...moved, title: "Renamed" };
    const renameScene = selector(renamed);
    const renameDelta = deriveBoardSceneDelta({
      previousDocument: moved,
      previousScene: after,
      nextDocument: renamed,
      nextScene: renameScene,
    });
    expect(renameDelta.kind).toBe("noop");
    expect(renameDelta.viewportChanged).toBe(false);
  });

  it("updates only the object whose immutable record changes", () => {
    const base = document();
    const selector = createBoardSceneSelector();
    const before = selector(base);
    const modified = {
      ...base,
      objects: {
        ...base.objects,
        [secondId]: {
          ...base.objects[secondId]!,
          position: { x: 180, y: 15 },
        },
      },
    };
    const after = selector(modified);
    const delta = deriveBoardSceneDelta({
      previousDocument: base,
      previousScene: before,
      nextDocument: modified,
      nextScene: after,
    });

    expect(delta.kind).toBe("patch");
    expect(delta.changedIds).toEqual([secondId]);
    expect(delta.updated).toHaveLength(1);
    expect(delta.updated[0]?.previous).toBe(before.items[1]);
    expect(delta.updated[0]?.next).toBe(after.items[1]);
    expect(delta.added).toHaveLength(0);
    expect(delta.removed).toHaveLength(0);
  });

  it("allows tail append and tail removal with stable surviving order", () => {
    const base = document();
    const selector = createBoardSceneSelector();
    const before = selector(base);
    const appended = {
      ...base,
      objects: { ...base.objects, [thirdId]: rectangle(thirdId, 200) },
      order: [...base.order, thirdId],
    };
    const appendedScene = selector(appended);
    const added = deriveBoardSceneDelta({
      previousDocument: base,
      previousScene: before,
      nextDocument: appended,
      nextScene: appendedScene,
    });

    expect(added.kind).toBe("patch");
    expect(added.added.map((item) => item.object.id)).toEqual([thirdId]);
    expect(added.updated).toHaveLength(0);

    const removed = deriveBoardSceneDelta({
      previousDocument: appended,
      previousScene: appendedScene,
      nextDocument: base,
      nextScene: selector(base),
    });
    expect(removed.kind).toBe("patch");
    expect(removed.removed.map((item) => item.object.id)).toEqual([thirdId]);
    expect(removed.added).toHaveLength(0);
  });

  it("falls back for reorder or deletion in the middle", () => {
    const base = document();
    const selector = createBoardSceneSelector();
    const before = selector(base);
    const reordered = { ...base, order: [secondId, firstId] };
    const after = selector(reordered);

    const delta = deriveBoardSceneDelta({
      previousDocument: base,
      previousScene: before,
      nextDocument: reordered,
      nextScene: after,
    });
    expect(delta.kind).toBe("reset");
    expect(delta.reason).toBe("order-changed");

    const middleDeleted = {
      ...base,
      objects: { [secondId]: base.objects[secondId]! },
      order: [secondId],
    };
    const deletion = deriveBoardSceneDelta({
      previousDocument: base,
      previousScene: before,
      nextDocument: middleDeleted,
      nextScene: selector(middleDeleted),
    });
    expect(deletion.kind).toBe("reset");
    expect(deletion.reason).toBe("order-changed");
  });

  it("resets across document replacement and inconsistent read models", () => {
    const base = document();
    const selector = createBoardSceneSelector();
    const before = selector(base);
    const other = {
      ...base,
      id: documentId("document:ice2-replaced"),
    };
    const replacement = deriveBoardSceneDelta({
      previousDocument: base,
      previousScene: before,
      nextDocument: other,
      nextScene: selector(other),
    });
    expect(replacement.kind).toBe("reset");
    expect(replacement.reason).toBe("document-changed");

    const invalid = deriveBoardSceneDelta({
      previousDocument: base,
      previousScene: before,
      nextDocument: base,
      nextScene: { ...before, items: [...before.items].reverse() },
    });
    expect(invalid.kind).toBe("reset");
    expect(invalid.reason).toBe("invalid-scene-order");
  });
});
