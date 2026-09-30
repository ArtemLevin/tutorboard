import { describe, expect, it } from "vitest";

import {
  boardObjectId,
  defaultViewport,
  type BoardObject,
  type BoardSceneReadModel,
} from "../../core/public";
import {
  aggregateSelectionBounds,
  pointInSelectionBounds,
  selectSelectionBounds,
  selectObjectIdsNearPath,
  selectTopObjectIdNearPoint,
} from "./geometry";

const strokeStyle = {
  fill: null,
  opacity: 1,
  stroke: "#111111",
  strokeWidth: 2,
} as const;

function line(
  id: string,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): Extract<BoardObject, { kind: "drawing.line" }> {
  return {
    end: { x: endX, y: endY },
    groupId: null,
    id: boardObjectId(id),
    kind: "drawing.line",
    locked: false,
    position: { x: startX, y: startY },
    rotation: 0,
    scale: { x: 1, y: 1 },
    source: { kind: "user" },
    style: strokeStyle,
    visible: true,
  };
}

function rectangle(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
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
    style: { ...strokeStyle, fill: "#ffffff" },
    visible: true,
  };
}

function scene(objects: readonly BoardObject[]): BoardSceneReadModel {
  return {
    items: objects.map((object) => ({ object, transforms: [] })),
    viewport: defaultViewport,
  };
}

describe("forgiving selection geometry", () => {
  it("selects a thin line from nearby empty canvas and respects tolerance", () => {
    const thin = line("object:thin", 10, 20, 100, 0);
    const model = scene([thin]);

    expect(selectTopObjectIdNearPoint(model, { x: 50, y: 30 }, 11)).toBe(
      thin.id,
    );
    expect(selectTopObjectIdNearPoint(model, { x: 50, y: 33 }, 11)).toBeNull();
  });

  it("prefers the visually topmost nearby object", () => {
    const lower = line("object:lower", 0, 0, 100, 0);
    const upper = line("object:upper", 0, 4, 100, 0);

    expect(
      selectTopObjectIdNearPoint(scene([lower, upper]), { x: 50, y: 2 }, 8),
    ).toBe(upper.id);
  });

  it("treats filled interiors as direct proximity hits", () => {
    const filled = rectangle("object:filled", 20, 30, 80, 60);
    expect(
      selectTopObjectIdNearPoint(scene([filled]), { x: 50, y: 50 }, 0),
    ).toBe(filled.id);
  });

  it("builds a padded aggregate drag surface across selected objects", () => {
    const left = rectangle("object:left", 10, 10, 20, 20);
    const right = rectangle("object:right", 90, 10, 20, 20);
    const model = scene([left, right]);
    const aggregate = aggregateSelectionBounds(
      selectSelectionBounds(model, [left.id, right.id]),
      6,
    );

    expect(aggregate).not.toBeNull();
    expect(pointInSelectionBounds({ x: 60, y: 20 }, aggregate!)).toBe(true);
    expect(pointInSelectionBounds({ x: 60, y: 50 }, aggregate!)).toBe(false);
  });

  it("finds multiple objects crossed by an eraser brush path", () => {
    const first = rectangleObject({
      id: boardObjectId("object:brush-first"),
      position: { x: 20, y: 20 },
      size: { height: 40, width: 40 },
    });
    const second = rectangleObject({
      id: boardObjectId("object:brush-second"),
      position: { x: 120, y: 20 },
      size: { height: 40, width: 40 },
    });
    const scene = createScene([first, second]);

    expect(
      selectObjectIdsNearPath(
        scene,
        [
          { x: 0, y: 40 },
          { x: 180, y: 40 },
        ],
        8,
      ),
    ).toEqual([first.id, second.id]);
  });
});
