import { describe, expect, it } from "vitest";

import {
  boardObjectId,
  createEmptyBoardDocument,
  defaultViewport,
  documentId,
  type BoardDocument,
  type BoardObject,
  type BoardSceneReadModel,
} from "../../core/public";
import { createSelectionStepTransforms } from "./selection-step";

const style = {
  fill: null,
  opacity: 1,
  stroke: "#222222",
  strokeWidth: 2,
} as const;

function rect(
  id: string,
  x: number,
  y: number,
  overrides: Partial<Extract<BoardObject, { kind: "drawing.rectangle" }>> = {},
): Extract<BoardObject, { kind: "drawing.rectangle" }> {
  return {
    groupId: null,
    id: boardObjectId(id),
    kind: "drawing.rectangle",
    locked: false,
    position: { x, y },
    rotation: 0,
    scale: { x: 1, y: 1 },
    size: { width: 100, height: 100 },
    source: { kind: "user" },
    style,
    visible: true,
    ...overrides,
  };
}

function fixture(objects: readonly BoardObject[]): {
  document: BoardDocument;
  scene: BoardSceneReadModel;
} {
  const base = createEmptyBoardDocument({
    createdAt: "2026-10-18T13:00:00.000Z",
    id: documentId("document:selection-wheel"),
    title: "Selection wheel",
  });
  return {
    document: {
      ...base,
      objects: Object.fromEntries(objects.map((object) => [object.id, object])),
      order: objects.map((object) => object.id),
    },
    scene: {
      items: objects.map((object) => ({ object, transforms: [] })),
      viewport: defaultViewport,
    },
  };
}

describe("selection scale and rotation steps", () => {
  it("scales heterogeneous objects around the same visual center", () => {
    const first = rect("object:rectangle", 0, 0);
    const second: BoardObject = {
      groupId: null,
      id: boardObjectId("object:text"),
      kind: "drawing.text",
      locked: false,
      position: { x: 200, y: 0 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      source: { kind: "user" },
      style,
      text: "Text",
      visible: true,
    };
    const { document, scene } = fixture([first, second]);
    const transforms = createSelectionStepTransforms(
      document,
      scene,
      [first.id, second.id],
      1.1,
      0,
    );
    expect(transforms).toHaveLength(2);
    expect(transforms?.map(({ scale }) => scale)).toEqual([
      { x: 1.1, y: 1.1 },
      { x: 1.1, y: 1.1 },
    ]);
    expect(transforms?.[0]?.position.x).toBeLessThan(0);
    expect(transforms?.[1]?.position.x).toBeGreaterThan(200);
  });

  it("preserves a rotated image center and rotates a two-object group", () => {
    const image = {
      contentSha256: "0".repeat(64),
      dataUrl: "data:image/png;base64,AA==",
      fileName: "image.png",
      groupId: null,
      id: boardObjectId("object:image"),
      intrinsicSize: { width: 200, height: 100 },
      kind: "image.embedded" as const,
      locked: false,
      mimeType: "image/png" as const,
      position: { x: 50, y: 60 },
      rotation: 90,
      scale: { x: 1, y: 1 },
      size: { width: 200, height: 100 },
      source: { kind: "user" as const },
      style,
      visible: true,
    };
    const { document, scene } = fixture([image]);
    const scaled = createSelectionStepTransforms(
      document,
      scene,
      [image.id],
      1.5,
      0,
    );
    expect(scaled?.[0]?.position.x).toBeCloseTo(75);
    expect(scaled?.[0]?.position.y).toBeCloseTo(10);

    const left = rect("object:left", 0, 0);
    const right = rect("object:right", 200, 0);
    const pair = fixture([left, right]);
    const rotated = createSelectionStepTransforms(
      pair.document,
      pair.scene,
      [left.id, right.id],
      1,
      90,
    );
    expect(rotated?.[0]?.position).toEqual({ x: 200, y: -100 });
    expect(rotated?.[1]?.position).toEqual({ x: 200, y: 100 });
    expect(rotated?.map((item) => item.rotation)).toEqual([90, 90]);
  });

  it("bounds scale and rejects ineligible objects", () => {
    const first = rect("object:near-limit", 0, 0, {
      scale: { x: 99, y: 80 },
    });
    const second = rect("object:regular", 150, 0);
    const pair = fixture([first, second]);
    const step = createSelectionStepTransforms(
      pair.document,
      pair.scene,
      [first.id, second.id],
      1.1,
      0,
    );
    expect(step?.[0]?.scale.x).toBe(100);
    expect(step?.[1]?.scale.x).toBeCloseTo(100 / 99);
    expect(
      createSelectionStepTransforms(
        fixture([rect("object:locked", 0, 0, { locked: true })]).document,
        fixture([rect("object:locked", 0, 0, { locked: true })]).scene,
        [boardObjectId("object:locked")],
        1.1,
        0,
      ),
    ).toBeNull();
    const invalid = createSelectionStepTransforms(
      pair.document,
      pair.scene,
      [first.id],
      0,
      0,
    );
    expect(invalid).toBeNull();
    expect(
      createSelectionStepTransforms(
        pair.document,
        pair.scene,
        [first.id, second.id],
        Number.NaN,
        0,
      ),
    ).toBeNull();
  });
});
