import { describe, expect, it } from "vitest";

import {
  boardObjectId,
  createVectorInkData,
  defaultViewport,
  type BoardObject,
  type BoardSceneReadModel,
  type Transform2D,
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

function scene(
  objects: readonly BoardObject[],
  options: {
    readonly transforms?: Readonly<Record<string, readonly Transform2D[]>>;
    readonly zoom?: number;
  } = {},
): BoardSceneReadModel {
  return {
    items: objects.map((object) => ({
      object,
      transforms: options.transforms?.[object.id] ?? [],
    })),
    viewport: { ...defaultViewport, zoom: options.zoom ?? defaultViewport.zoom },
  };
}

function ellipse(
  id: string,
  x: number,
  y: number,
  radiusX: number,
  radiusY: number,
): Extract<BoardObject, { kind: "drawing.ellipse" }> {
  return {
    groupId: null,
    id: boardObjectId(id),
    kind: "drawing.ellipse",
    locked: false,
    position: { x, y },
    radius: { x: radiusX, y: radiusY },
    rotation: 0,
    scale: { x: 1, y: 1 },
    source: { kind: "user" },
    style: strokeStyle,
    visible: true,
  };
}

function textObject(
  id: string,
  x: number,
  y: number,
  text: string,
): Extract<BoardObject, { kind: "drawing.text" }> {
  return {
    groupId: null,
    id: boardObjectId(id),
    kind: "drawing.text",
    locked: false,
    position: { x, y },
    rotation: 0,
    scale: { x: 1, y: 1 },
    source: { kind: "user" },
    style: { ...strokeStyle, fill: "#111111" },
    text,
    visible: true,
  };
}

function penStroke(
  id: string,
  x: number,
  y: number,
): Extract<BoardObject, { kind: "drawing.pen-stroke" }> {
  const samples = [
    { point: { x: 0, y: 0 }, pressure: 0.5, timestampMs: 0 },
    { point: { x: 40, y: 0 }, pressure: 0.5, timestampMs: 8 },
  ] as const;
  return {
    groupId: null,
    id: boardObjectId(id),
    ink: createVectorInkData(samples),
    kind: "drawing.pen-stroke",
    locked: false,
    points: samples.map(({ point }) => point),
    position: { x, y },
    rotation: 0,
    scale: { x: 1, y: 1 },
    source: { kind: "user" },
    style: strokeStyle,
    visible: true,
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

  it("treats media asset interiors as eraser hits", () => {
    const media: BoardObject = {
      assetId: "asset:test-media",
      byteSize: 1024,
      contentSha256: "a".repeat(64),
      fileName: "figure.png",
      groupId: null,
      id: boardObjectId("object:media"),
      intrinsicSize: { height: 400, width: 600 },
      kind: "media.asset",
      locked: false,
      mimeType: "image/png",
      position: { x: 20, y: 30 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      size: { height: 100, width: 150 },
      source: { kind: "user" },
      style: strokeStyle,
      visible: true,
    };

    expect(
      selectObjectIdsNearPath(scene([media]), [{ x: 80, y: 70 }], 0),
    ).toEqual([media.id]);
  });

  it("keeps broad-phase filtering conservative across mixed object kinds", () => {
    const thin = line("object:mixed-line", 0, 20, 40, 0);
    const filled = rectangle("object:mixed-rect", 80, 0, 40, 40);
    const oval = ellipse("object:mixed-ellipse", 170, 20, 20, 16);
    const label = textObject("object:mixed-text", 220, 0, "Text");
    const ink = penStroke("object:mixed-pen", 300, 20);
    const distant = rectangle("object:mixed-distant", 1_000, 1_000, 40, 40);
    const model = scene([thin, filled, oval, label, ink, distant]);

    expect(
      selectObjectIdsNearPath(
        model,
        [
          { x: -10, y: 20 },
          { x: 360, y: 20 },
        ],
        2,
      ),
    ).toEqual([thin.id, filled.id, oval.id, label.id, ink.id]);
  });

  it("keeps tolerance boundary hits and rejects objects just outside it", () => {
    const boundary = line("object:boundary", 0, 10, 100, 0);
    const outside = line("object:outside", 0, 10.01, 100, 0);
    const brush = [{ x: 0, y: 0 }, { x: 100, y: 0 }] as const;

    expect(selectObjectIdsNearPath(scene([boundary]), brush, 10)).toEqual([
      boundary.id,
    ]);
    expect(selectObjectIdsNearPath(scene([outside]), brush, 10)).toEqual([]);
  });

  it("accounts for composed transforms before broad-phase rejection", () => {
    const moved = rectangle("object:transformed", 0, 0, 20, 20);
    const transform: Transform2D = {
      rotation: 30,
      scale: { x: 1.5, y: 0.75 },
      translation: { x: 500, y: 120 },
    };
    const model = scene([moved], {
      transforms: { [moved.id]: [transform] },
    });

    expect(
      selectObjectIdsNearPath(
        model,
        [
          { x: 495, y: 125 },
          { x: 535, y: 125 },
        ],
        8,
      ),
    ).toEqual([moved.id]);
  });

  it("uses world geometry independently of viewport zoom", () => {
    const target = rectangle("object:zoom-independent", 100, 100, 60, 40);
    const path = [
      { x: 80, y: 120 },
      { x: 180, y: 120 },
    ] as const;

    expect(selectObjectIdsNearPath(scene([target], { zoom: 0.25 }), path, 4)).toEqual(
      [target.id],
    );
    expect(selectObjectIdsNearPath(scene([target], { zoom: 4 }), path, 4)).toEqual([
      target.id,
    ]);
  });

  it("finds multiple objects crossed by an eraser brush path", () => {
    const first = rectangle("object:brush-first", 20, 20, 40, 40);
    const second = rectangle("object:brush-second", 120, 20, 40, 40);
    const model = scene([first, second]);

    expect(
      selectObjectIdsNearPath(
        model,
        [
          { x: 0, y: 40 },
          { x: 180, y: 40 },
        ],
        8,
      ),
    ).toEqual([first.id, second.id]);
  });
});
