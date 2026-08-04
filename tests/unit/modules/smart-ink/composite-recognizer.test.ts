import { describe, expect, it } from "vitest";

import {
  boardObjectId,
  type BoardObject,
  type BoardObjectId,
  type EllipseObject,
  type LineObject,
  type PenStrokeObject,
  type RectangleObject,
  type Vec2,
} from "../../../../src/core/public";
import {
  proposeSmartInkComposite,
  smartInkCompositeRecognizerVersion,
} from "../../../../src/modules/smart-ink/public";

const style = {
  fill: null,
  opacity: 1,
  stroke: "#245d6b",
  strokeWidth: 3,
} as const;

let sequence = 0;

function id(): BoardObjectId {
  sequence += 1;
  return boardObjectId(`smart-ink-composite:${sequence}`);
}

function base(position: Vec2) {
  return {
    groupId: null,
    id: id(),
    locked: false,
    position,
    rotation: 0,
    scale: { x: 1, y: 1 },
    source: { kind: "user" as const },
    style,
    visible: true,
  };
}

function ellipse(position: Vec2, radius: Vec2): EllipseObject {
  return { ...base(position), kind: "drawing.ellipse", radius };
}

function line(start: Vec2, end: Vec2): LineObject {
  return {
    ...base(start),
    end: { x: end.x - start.x, y: end.y - start.y },
    kind: "drawing.line",
  };
}

function rectangle(
  position: Vec2,
  width: number,
  height: number,
  rotation = 0,
): RectangleObject {
  return {
    ...base(position),
    kind: "drawing.rectangle",
    rotation,
    size: { height, width },
  };
}

function polygon(vertices: readonly Vec2[]): PenStrokeObject {
  const first = vertices[0]!;
  return {
    ...base(first),
    kind: "drawing.pen-stroke",
    points: [...vertices, first].map((point) => ({
      x: point.x - first.x,
      y: point.y - first.y,
    })),
  };
}

function recognize(objects: readonly BoardObject[]) {
  const result = proposeSmartInkComposite(objects);
  expect(result?.recognizerVersion).toBe(smartInkCompositeRecognizerVersion);
  return result;
}

describe("Smart Ink composite recognizer", () => {
  it("snaps a triangle inscribed in a circle", () => {
    const circle = ellipse({ x: 0, y: 0 }, { x: 50, y: 50 });
    const triangle = polygon([
      { x: 0, y: -46 },
      { x: 44, y: 27 },
      { x: -43, y: 28 },
    ]);

    const result = recognize([circle, triangle]);

    expect(result?.kind).toBe("inscribed-triangle");
    expect(result?.replacements).toHaveLength(2);
  });

  it("fits a circle to a circumscribed quadrilateral", () => {
    const square = rectangle({ x: -50, y: -50 }, 100, 100);
    const circle = ellipse({ x: 2, y: -1 }, { x: 44, y: 46 });

    const result = recognize([circle, square]);

    expect(result?.kind).toBe("circumscribed-quadrilateral");
    expect(
      result?.replacements.find((object) => object.id === circle.id),
    ).toMatchObject({
      kind: "drawing.ellipse",
      position: { x: 0, y: 0 },
      radius: { x: 50, y: 50 },
    });
  });

  it("completes the school projection of a sphere", () => {
    const outer = ellipse({ x: 10, y: 20 }, { x: 50, y: 50 });
    const equator = ellipse({ x: 12, y: 18 }, { x: 44, y: 14 });

    const result = recognize([outer, equator]);

    expect(result?.kind).toBe("sphere");
    const replacement = result?.replacements.find(
      (object) => object.id === equator.id,
    );
    expect(replacement).toMatchObject({ position: { x: 10, y: 20 } });
    expect(
      replacement?.kind === "drawing.ellipse" ? replacement.radius.x : 0,
    ).toBeCloseTo(45);
    expect(
      replacement?.kind === "drawing.ellipse" ? replacement.radius.y : 0,
    ).toBeCloseTo(14);
  });

  it("completes cone and cylinder projections", () => {
    const cone = recognize([
      ellipse({ x: 0, y: 50 }, { x: 40, y: 10 }),
      line({ x: 1, y: -40 }, { x: -38, y: 51 }),
      line({ x: -2, y: -39 }, { x: 42, y: 49 }),
    ]);
    expect(cone?.kind).toBe("cone");

    const cylinder = recognize([
      ellipse({ x: 0, y: 0 }, { x: 40, y: 12 }),
      ellipse({ x: 2, y: 100 }, { x: 42, y: 13 }),
      line({ x: -39, y: 1 }, { x: -40, y: 99 }),
      line({ x: 41, y: -1 }, { x: 43, y: 101 }),
    ]);
    expect(cylinder?.kind).toBe("cylinder");
  });

  it("completes cube and cuboid projections", () => {
    const cube = recognize([
      rectangle({ x: 0, y: 20 }, 60, 60),
      rectangle({ x: 90, y: 60 }, 60, 60, 180),
      line({ x: 0, y: 20 }, { x: 30, y: 0 }),
      line({ x: 60, y: 20 }, { x: 90, y: 0 }),
      line({ x: 60, y: 80 }, { x: 90, y: 60 }),
      line({ x: 0, y: 80 }, { x: 30, y: 60 }),
    ]);
    expect(cube?.kind).toBe("cube");

    const cuboid = recognize([
      rectangle({ x: 0, y: 20 }, 100, 55),
      rectangle({ x: 28, y: 0 }, 100, 55),
      line({ x: 0, y: 20 }, { x: 28, y: 0 }),
      line({ x: 100, y: 20 }, { x: 128, y: 0 }),
      line({ x: 100, y: 75 }, { x: 128, y: 55 }),
      line({ x: 0, y: 75 }, { x: 28, y: 55 }),
    ]);
    expect(cuboid?.kind).toBe("cuboid");
  });

  it("completes triangular prism and pyramid projections", () => {
    const firstTriangle = [
      { x: 0, y: 60 },
      { x: 35, y: 0 },
      { x: 70, y: 60 },
    ];
    const secondTriangle = firstTriangle.map((point) => ({
      x: point.x + 35,
      y: point.y - 20,
    }));
    const prism = recognize([
      polygon(firstTriangle),
      polygon([...secondTriangle].reverse()),
      ...firstTriangle.map((point, index) =>
        line(point, secondTriangle[index]!),
      ),
    ]);
    expect(prism?.kind).toBe("triangular-prism");

    const corners = [
      { x: 0, y: 30 },
      { x: 80, y: 30 },
      { x: 80, y: 80 },
      { x: 0, y: 80 },
    ];
    const apex = { x: 40, y: -40 };
    const pyramid = recognize([
      rectangle(corners[0]!, 80, 50),
      ...corners.map((corner) => line(apex, corner)),
    ]);
    expect(pyramid?.kind).toBe("pyramid");
  });

  it("ignores unrelated recent primitives", () => {
    expect(
      proposeSmartInkComposite([
        ellipse({ x: 0, y: 0 }, { x: 50, y: 20 }),
        line({ x: 200, y: 200 }, { x: 260, y: 210 }),
      ]),
    ).toBeNull();
  });
});
