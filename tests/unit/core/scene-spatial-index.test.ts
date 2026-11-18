import { describe, expect, it } from "vitest";

import {
  boardObjectId,
  createBoardSceneSelector,
  createBoardSceneSpatialIndex,
  createEmptyBoardDocument,
  deriveBoardSceneDelta,
  deriveSceneDirtyBounds,
  documentId,
  selectVisibleBoardItems,
  type BoardDocument,
  type BoardObjectId,
  type RectangleObject,
} from "../../../src/core/public";

const firstId = boardObjectId("object:ice2b-first");
const secondId = boardObjectId("object:ice2b-second");
const thirdId = boardObjectId("object:ice2b-third");
const fourthId = boardObjectId("object:ice2b-fourth");

function rectangle(
  id: BoardObjectId,
  x: number,
  width = 60,
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
    size: { width, height: 40 },
  };
}

function document(): BoardDocument {
  const base = createEmptyBoardDocument({
    createdAt: "2026-11-18T10:00:00.000Z",
    id: documentId("document:ice2b-broad-phase"),
    title: "ICE-02B spatial broad phase",
  });
  return {
    ...base,
    objects: {
      [firstId]: rectangle(firstId, 0),
      [secondId]: rectangle(secondId, 260),
      [thirdId]: rectangle(thirdId, 520),
    },
    order: [firstId, secondId, thirdId],
  };
}

describe("ICE-02B spatial broad phase", () => {
  it("matches the shipping visibility selector and exact document z-order", () => {
    const scene = createBoardSceneSelector()(document());
    const spatial = createBoardSceneSpatialIndex(scene);
    const size = { width: 180, height: 140, overscan: 0 };
    for (const viewport of [
      { zoom: 1, offset: { x: 0, y: 0 } },
      { zoom: 1, offset: { x: -270, y: 0 } },
      { zoom: 2, offset: { x: -1_000, y: -10 } },
      { zoom: 0.5, offset: { x: -10, y: -5 } },
    ]) {
      expect(spatial.queryViewport(viewport, size)).toEqual(
        selectVisibleBoardItems(scene.items, viewport, size),
      );
    }
    expect(spatial.stats().items).toBe(3);
    expect(spatial.stats().overflowItems).toBe(0);
    spatial.dispose();
    expect(spatial.stats()).toEqual({
      items: 0,
      buckets: 0,
      bucketReferences: 0,
      overflowItems: 0,
    });
  });

  it("updates one immutable item and reports old/new dirty world bounds", () => {
    const base = document();
    const selector = createBoardSceneSelector();
    const before = selector(base);
    const spatial = createBoardSceneSpatialIndex(before);
    const second = base.objects[secondId] as RectangleObject;
    const moved = {
      ...base,
      objects: {
        ...base.objects,
        [secondId]: { ...second, position: { x: 9_000, y: 10 } },
      },
    };
    const after = selector(moved);
    const delta = deriveBoardSceneDelta({
      previousDocument: base,
      previousScene: before,
      nextDocument: moved,
      nextScene: after,
    });

    expect(delta.kind).toBe("patch");
    const dirty = deriveSceneDirtyBounds(delta);
    expect(dirty.fullInvalidation).toBe(false);
    expect(dirty.items).toHaveLength(1);
    expect(dirty.items[0]?.id).toBe(secondId);
    expect(dirty.items[0]?.before?.left).toBeLessThan(260);
    expect(dirty.items[0]?.after?.left).toBeGreaterThan(8_900);

    expect(spatial.apply(delta, after)).toBe("patch");
    expect(spatial.queryWorld({ left: 250, top: 0, right: 340, bottom: 100 })).toEqual(
      [],
    );
    expect(
      spatial
        .queryWorld({ left: 8_990, top: 0, right: 9_090, bottom: 100 })
        .map((item) => item.object.id),
    ).toEqual([secondId]);
    expect(spatial.boundsFor(secondId)).toEqual(dirty.items[0]?.after);
  });

  it("supports safe tail edits, camera-only deltas and conservative reorder reset", () => {
    const base = document();
    const selector = createBoardSceneSelector();
    const before = selector(base);
    const spatial = createBoardSceneSpatialIndex(before);
    const appended = {
      ...base,
      objects: {
        ...base.objects,
        [fourthId]: rectangle(fourthId, 780),
      },
      order: [...base.order, fourthId],
    };
    const appendedScene = selector(appended);
    const added = deriveBoardSceneDelta({
      previousDocument: base,
      previousScene: before,
      nextDocument: appended,
      nextScene: appendedScene,
    });
    expect(spatial.apply(added, appendedScene)).toBe("patch");
    expect(spatial.stats().items).toBe(4);
    expect(
      spatial
        .queryWorld({ left: -100, top: -100, right: 1_000, bottom: 100 })
        .map((item) => item.object.id),
    ).toEqual(appended.order);

    const movedViewport = {
      ...appended,
      viewport: { zoom: 1.6, offset: { x: -500, y: 30 } },
    };
    const cameraScene = selector(movedViewport);
    const camera = deriveBoardSceneDelta({
      previousDocument: appended,
      previousScene: appendedScene,
      nextDocument: movedViewport,
      nextScene: cameraScene,
    });
    expect(camera.kind).toBe("camera");
    expect(spatial.apply(camera, cameraScene)).toBe("unchanged");
    expect(deriveSceneDirtyBounds(camera).items).toHaveLength(0);

    const reordered = { ...movedViewport, order: [secondId, firstId, thirdId, fourthId] };
    const reorderedScene = selector(reordered);
    const reset = deriveBoardSceneDelta({
      previousDocument: movedViewport,
      previousScene: cameraScene,
      nextDocument: reordered,
      nextScene: reorderedScene,
    });
    expect(reset.kind).toBe("reset");
    expect(deriveSceneDirtyBounds(reset).fullInvalidation).toBe(true);
    expect(spatial.apply(reset, reorderedScene)).toBe("rebuild");
    expect(
      spatial
        .queryWorld({ left: -100, top: -100, right: 1_000, bottom: 100 })
        .map((item) => item.object.id),
    ).toEqual(reordered.order);
  });

  it("bounds memory for oversized objects and returns them via overflow scan", () => {
    const base = document();
    const huge = {
      ...base,
      objects: {
        ...base.objects,
        [firstId]: rectangle(firstId, 0, 10_000_000),
      },
    };
    const scene = createBoardSceneSelector()(huge);
    const spatial = createBoardSceneSpatialIndex(scene);
    expect(spatial.stats().overflowItems).toBe(1);
    expect(spatial.stats().bucketReferences).toBeLessThanOrEqual(128);
    const farView = { zoom: 1, offset: { x: -9_000_000, y: 0 } };
    const size = { width: 200, height: 200, overscan: 0 };
    expect(spatial.queryViewport(farView, size)).toEqual(
      selectVisibleBoardItems(scene.items, farView, size),
    );
    spatial.dispose();
    expect(spatial.stats().bucketReferences).toBe(0);
  });

  it("preserves visibility and bounded references across repeated scene replacement", () => {
    const selector = createBoardSceneSelector();
    const initial = selector(document());
    const spatial = createBoardSceneSpatialIndex(initial);
    for (let round = 0; round < 12; round += 1) {
      const base = document();
      const shifted = {
        ...base,
        id: documentId(`document:ice2b-round-${round}`),
        objects: {
          ...base.objects,
          [secondId]: {
            ...base.objects[secondId]!,
            visible: round % 2 === 0,
          },
        },
      };
      const nextScene = selector(shifted);
      const delta = deriveBoardSceneDelta({
        previousDocument: null,
        previousScene: null,
        nextDocument: shifted,
        nextScene,
      });
      expect(spatial.apply(delta, nextScene)).toBe("rebuild");
      expect(spatial.stats().items).toBe(3);
      expect(spatial.stats().bucketReferences).toBeLessThan(30);
      expect(
        spatial.queryViewport(
          { zoom: 1, offset: { x: -240, y: 0 } },
          { width: 250, height: 100, overscan: 0 },
        ),
      ).toEqual(
        selectVisibleBoardItems(
          nextScene.items,
          { zoom: 1, offset: { x: -240, y: 0 } },
          { width: 250, height: 100, overscan: 0 },
        ),
      );
    }
  });
});
