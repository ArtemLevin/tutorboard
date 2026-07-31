import { describe, expect, it } from "vitest";

import {
  boardObjectId,
  defaultViewport,
  type BoardObject,
  type BoardSceneReadModel,
  type Transform2D,
} from "../../core/public";
import {
  lassoPolygonArea,
  normalizeLassoPoints,
  pointInPolygon,
  selectObjectIdsInLasso,
} from "./geometry";

const style = {
  fill: "#ffffff",
  opacity: 1,
  stroke: "#111111",
  strokeWidth: 2,
} as const;

function rectangle(
  id: string,
  x: number,
  y: number,
  width: number,
  height: number,
  visible = true,
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
    visible,
  };
}

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
    style,
    visible: true,
  };
}

function scene(
  objects: readonly BoardObject[],
  transforms: Readonly<Record<string, readonly Transform2D[]>> = {},
): BoardSceneReadModel {
  return {
    items: objects.map((object) => ({
      object,
      transforms: transforms[object.id] ?? [],
    })),
    viewport: defaultViewport,
  };
}

const square = [
  { x: 0, y: 0 },
  { x: 50, y: 0 },
  { x: 50, y: 50 },
  { x: 0, y: 50 },
] as const;

describe("lasso geometry", () => {
  it("normalizes duplicate points and includes polygon boundaries", () => {
    expect(
      normalizeLassoPoints([...square, square[0], { x: Number.NaN, y: 2 }]),
    ).toEqual(square);
    expect(lassoPolygonArea(square)).toBe(2500);
    expect(pointInPolygon({ x: 0, y: 25 }, square)).toBe(true);
    expect(pointInPolygon({ x: 60, y: 25 }, square)).toBe(false);
  });

  it("selects intersecting shapes while excluding distant and hidden objects", () => {
    const first = rectangle("object:first", 10, 10, 30, 30);
    const distant = rectangle("object:distant", 100, 100, 30, 30);
    const hidden = rectangle("object:hidden", 15, 15, 10, 10, false);

    expect(selectObjectIdsInLasso(scene([first, distant, hidden]), square)).toEqual([
      first.id,
    ]);
  });

  it("selects a large filled object when the lasso lies inside it", () => {
    const large = rectangle("object:large", -100, -100, 300, 300);
    const inner = [
      { x: 10, y: 10 },
      { x: 20, y: 10 },
      { x: 20, y: 20 },
      { x: 10, y: 20 },
    ];

    expect(selectObjectIdsInLasso(scene([large]), inner)).toEqual([large.id]);
  });

  it("detects line crossings and composed scene transforms", () => {
    const crossing = line("object:line", -20, 25, 90, 0);
    const moved = rectangle("object:moved", 0, 0, 20, 20);
    const translation: Transform2D = {
      rotation: 0,
      scale: { x: 1, y: 1 },
      translation: { x: 120, y: 10 },
    };
    const movedLasso = [
      { x: 115, y: 5 },
      { x: 145, y: 5 },
      { x: 145, y: 35 },
      { x: 115, y: 35 },
    ];

    expect(selectObjectIdsInLasso(scene([crossing]), square)).toEqual([
      crossing.id,
    ]);
    expect(
      selectObjectIdsInLasso(
        scene([moved], { [moved.id]: [translation] }),
        movedLasso,
      ),
    ).toEqual([moved.id]);
  });

  it("rejects degenerate lasso paths", () => {
    const object = rectangle("object:tiny", 0, 0, 10, 10);
    expect(
      selectObjectIdsInLasso(scene([object]), [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
      ]),
    ).toEqual([]);
  });
});
