import { describe, expect, it } from "vitest";

import {
  boardObjectId,
  groupId,
  type BoardRenderItem,
  type LineObject,
  type Transform2D,
  type Vec2,
} from "../public";
import {
  createLineEndpointRotationTransform,
  lineWorldEndpoints,
  type LineEndpoint,
} from "./line-endpoint-rotation";

const line: LineObject = {
  end: { x: 120, y: 0 },
  groupId: null,
  id: boardObjectId("object:line"),
  kind: "drawing.line",
  locked: false,
  position: { x: 30, y: 40 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  source: { kind: "user" },
  style: { fill: null, opacity: 1, stroke: "#111", strokeWidth: 2 },
  visible: true,
};

function applyTransform(
  item: BoardRenderItem,
  transform: NonNullable<
    ReturnType<typeof createLineEndpointRotationTransform>
  >,
): BoardRenderItem {
  return {
    ...item,
    object: {
      ...item.object,
      position: transform.position,
      rotation: transform.rotation,
      scale: transform.scale,
    },
  };
}

function pointDistance(left: Vec2, right: Vec2): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function expectRotationPreservesGeometry(
  item: BoardRenderItem,
  endpoint: LineEndpoint,
  pointer: Vec2,
) {
  const before = lineWorldEndpoints(item);
  expect(before).not.toBeNull();
  const transform = createLineEndpointRotationTransform(item, endpoint, pointer);
  expect(transform).not.toBeNull();
  if (before === null || transform === null) return;

  const after = lineWorldEndpoints(applyTransform(item, transform));
  expect(after).not.toBeNull();
  if (after === null) return;

  const fixedBefore = endpoint === "end" ? before.start : before.end;
  const fixedAfter = endpoint === "end" ? after.start : after.end;
  expect(pointDistance(fixedBefore, fixedAfter)).toBeLessThan(1e-4);
  expect(
    Math.abs(
      pointDistance(before.start, before.end) -
        pointDistance(after.start, after.end),
    ),
  ).toBeLessThan(1e-4);
}

describe("line endpoint rotation geometry", () => {
  it("rotates either endpoint around the opposite endpoint", () => {
    const item: BoardRenderItem = { object: line, transforms: [] };

    expectRotationPreservesGeometry(item, "end", { x: 30, y: 240 });
    expectRotationPreservesGeometry(item, "start", { x: 150, y: -80 });
  });

  it("preserves world geometry for an already transformed line", () => {
    const item: BoardRenderItem = {
      object: {
        ...line,
        position: { x: -15, y: 24 },
        rotation: 37,
        scale: { x: 1.4, y: 0.8 },
      },
      transforms: [],
    };

    expectRotationPreservesGeometry(item, "end", { x: 90, y: -110 });
  });

  it("preserves the fixed endpoint and world length under rotated non-uniform parent scale", () => {
    const parent: Transform2D = {
      rotation: 28,
      scale: { x: 1.8, y: 0.65 },
      translation: { x: 240, y: -70 },
    };
    const item: BoardRenderItem = {
      object: {
        ...line,
        groupId: groupId("group:line"),
        position: { x: 12, y: -18 },
        rotation: -21,
        scale: { x: 0.9, y: 1.3 },
      },
      transforms: [parent],
    };

    expectRotationPreservesGeometry(item, "end", { x: 480, y: 180 });
    expectRotationPreservesGeometry(item, "start", { x: 120, y: -220 });
  });

  it("rejects singular parent transforms and undefined pivot direction", () => {
    const singular: BoardRenderItem = {
      object: line,
      transforms: [
        {
          rotation: 0,
          scale: { x: 0, y: 1 },
          translation: { x: 0, y: 0 },
        },
      ],
    };
    expect(
      createLineEndpointRotationTransform(singular, "end", { x: 20, y: 20 }),
    ).toBeNull();

    const item: BoardRenderItem = { object: line, transforms: [] };
    const endpoints = lineWorldEndpoints(item);
    expect(endpoints).not.toBeNull();
    if (endpoints === null) return;
    expect(
      createLineEndpointRotationTransform(item, "end", endpoints.start),
    ).toBeNull();
  });
});
