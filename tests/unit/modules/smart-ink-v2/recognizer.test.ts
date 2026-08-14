import { describe, expect, it } from "vitest";

import {
  boardObjectId,
  createVectorInkDataFromPoints,
  type PenStrokeObject,
  type Vec2,
} from "../../../../src/core/public";
import {
  appendSmartInkStrokeSession,
  proposeSmartInkComposite,
  recognizeSmartInkV2,
  transformSmartInkMetamorphic,
} from "../../../../src/modules/smart-ink/public";

const style = {
  fill: null,
  opacity: 1,
  stroke: "#202020",
  strokeWidth: 3,
} as const;

function trace(vertices: readonly Vec2[]): readonly Vec2[] {
  return vertices.slice(0, -1).flatMap((start, edge) => {
    const end = vertices[edge + 1]!;
    return Array.from({ length: 18 }, (_, index) => {
      const progress = index / 18;
      return {
        x: start.x + (end.x - start.x) * progress,
        y: start.y + (end.y - start.y) * progress,
      };
    });
  });
}

function stroke(points: readonly Vec2[]): PenStrokeObject {
  return {
    groupId: null,
    id: boardObjectId("object:v2"),
    ink: createVectorInkDataFromPoints(points),
    kind: "drawing.pen-stroke",
    locked: false,
    points,
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    source: { kind: "user" },
    style,
    visible: true,
  };
}

const arrow = trace([
  { x: 20, y: 80 },
  { x: 260, y: 80 },
  { x: 205, y: 35 },
  { x: 260, y: 80 },
  { x: 205, y: 125 },
]);

describe("Smart Ink 2.0", () => {
  it("lets the arrow compete with primitive candidates", () => {
    const decision = recognizeSmartInkV2(stroke(arrow), arrow);
    expect(decision.status).toBe("accepted");
    expect(decision.selectedKind).toBe("arrow");
    expect(decision.candidate?.kind).toBe("arrow");
  });

  it("keeps metamorphic transforms deterministic", () => {
    const transformed = transformSmartInkMetamorphic(arrow, {
      rotation: Math.PI / 3,
      scale: 1.7,
      x: 120,
      y: -40,
    });
    expect(transformed).toHaveLength(arrow.length);
    expect(transformed).toEqual(
      transformSmartInkMetamorphic(arrow, {
        rotation: Math.PI / 3,
        scale: 1.7,
        x: 120,
        y: -40,
      }),
    );
  });

  it("starts a new stroke session after the temporal window", () => {
    const first = appendSmartInkStrokeSession(
      { items: [] },
      {
        endedAtMs: 100,
        id: "a",
        points: [
          { x: 0, y: 0 },
          { x: 50, y: 0 },
        ],
      },
    );
    const second = appendSmartInkStrokeSession(first, {
      endedAtMs: 700,
      id: "b",
      points: [
        { x: 50, y: 0 },
        { x: 70, y: 20 },
      ],
    });
    expect(second.items.map(({ id }) => id)).toEqual(["b"]);
  });

  it("recognizes a three-line arrow as one atomic composite", () => {
    const line = (id: string, position: Vec2, end: Vec2) => ({
      end,
      groupId: null,
      id: boardObjectId(id),
      kind: "drawing.line" as const,
      locked: false,
      position,
      rotation: 0,
      scale: { x: 1, y: 1 },
      source: { kind: "user" as const },
      style,
      visible: true,
    });
    const objects = [
      line("shaft", { x: 20, y: 80 }, { x: 240, y: 0 }),
      line("wing-left", { x: 260, y: 80 }, { x: -55, y: -45 }),
      line("wing-right", { x: 260, y: 80 }, { x: -55, y: 45 }),
    ];
    const proposal = proposeSmartInkComposite(objects);
    expect(proposal?.kind).toBe("arrow");
    expect(proposal?.originals).toHaveLength(3);
    expect(proposal?.replacements).toHaveLength(1);
    expect(proposal?.replacements[0]?.kind).toBe("drawing.pen-stroke");
  });
});
