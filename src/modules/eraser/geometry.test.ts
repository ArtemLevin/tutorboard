import { describe, expect, it } from "vitest";

import {
  boardObjectId,
  createVectorInkData,
  type BoardObject,
  type PenStrokeObject,
  type VectorInkSample,
} from "../../core/public";
import { erasePenStroke, planEraserChanges } from "./geometry";

function stroke(
  samples: readonly VectorInkSample[],
  overrides: Partial<PenStrokeObject> = {},
): PenStrokeObject {
  return {
    groupId: null,
    id: boardObjectId("object:stroke"),
    ink: createVectorInkData(samples, false),
    kind: "drawing.pen-stroke",
    locked: false,
    points: samples.map(({ point }) => point),
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    source: { kind: "user" },
    style: {
      fill: null,
      opacity: 1,
      stroke: "#111827",
      strokeWidth: 3,
    },
    visible: true,
    ...overrides,
  };
}

function samples(): readonly VectorInkSample[] {
  return Array.from({ length: 11 }, (_value, index) => ({
    point: { x: index * 10, y: 0 },
    pressure: 0.2 + index * 0.05,
    timestampMs: index * 8,
  }));
}

describe("vector partial eraser", () => {
  it("splits one stroke into two fragments around the eraser path", () => {
    const original = stroke(samples());
    const fragments = erasePenStroke(
      original,
      [{ x: 50, y: 0 }],
      8,
      (source, index) =>
        index === 0 ? source.id : boardObjectId(`object:fragment-${index}`),
    );

    expect(fragments).not.toBeNull();
    expect(fragments).toHaveLength(2);
    expect(fragments?.[0]?.id).toBe(original.id);
    expect(fragments?.[0]?.points.at(-1)?.x).toBeLessThan(43);
    expect(fragments?.[1]?.points[0]?.x).toBeGreaterThan(57);
  });

  it("returns an empty replacement list when the stroke is fully erased", () => {
    const fragments = erasePenStroke(
      stroke(samples()),
      [{ x: 50, y: 0 }],
      80,
      (source) => source.id,
    );

    expect(fragments).toEqual([]);
  });

  it("preserves pressure and monotonic timestamps on generated fragments", () => {
    const fragments = erasePenStroke(
      stroke(samples()),
      [{ x: 50, y: 0 }],
      8,
      (source, index) =>
        index === 0 ? source.id : boardObjectId(`object:fragment-${index}`),
    );
    expect(fragments).not.toBeNull();

    for (const fragment of fragments ?? []) {
      const fragmentSamples = fragment.ink?.samples ?? [];
      expect(fragmentSamples.length).toBeGreaterThanOrEqual(2);
      for (let index = 1; index < fragmentSamples.length; index += 1) {
        expect(fragmentSamples[index]!.timestampMs).toBeGreaterThanOrEqual(
          fragmentSamples[index - 1]!.timestampMs,
        );
      }
      expect(
        fragmentSamples.every(({ pressure }) => pressure >= 0 && pressure <= 1),
      ).toBe(true);
    }
  });

  it("plans partial pen erasure together with whole-object erasure", () => {
    const original = stroke(samples());
    const text: BoardObject = {
      groupId: null,
      id: boardObjectId("object:text"),
      kind: "drawing.text",
      locked: false,
      position: { x: 40, y: 40 },
      rotation: 0,
      scale: { x: 1, y: 1 },
      source: { kind: "user" },
      style: {
        fill: null,
        opacity: 1,
        stroke: "#111827",
        strokeWidth: 2,
      },
      text: "Удалить",
      visible: true,
    };
    const locked: BoardObject = {
      ...text,
      id: boardObjectId("object:locked"),
      locked: true,
    };

    const plan = planEraserChanges(
      [original, text, locked],
      [original.id, text.id, locked.id],
      [{ x: 50, y: 0 }],
      8,
      (source, index) =>
        index === 0 ? source.id : boardObjectId(`object:fragment-${index}`),
    );

    expect(plan.originals.map(({ id }) => id)).toEqual([original.id, text.id]);
    expect(plan.replacements).toHaveLength(2);
    expect(plan.groupedObjectIds).toEqual([]);
  });

  it("erases using world-space geometry after object transforms", () => {
    const transformed = stroke(samples(), {
      position: { x: 200, y: 100 },
      rotation: 90,
      scale: { x: 2, y: 1 },
    });
    const fragments = erasePenStroke(
      transformed,
      [{ x: 200, y: 200 }],
      10,
      (source, index) =>
        index === 0 ? source.id : boardObjectId(`object:fragment-${index}`),
    );

    expect(fragments).not.toBeNull();
    expect(fragments).toHaveLength(2);
  });
});
