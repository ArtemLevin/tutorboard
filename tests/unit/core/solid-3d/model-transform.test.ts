import { describe, expect, it } from "vitest";

import {
  applySolid3DQuaternion,
  defaultSolidProjection,
  identitySolid3DQuaternion,
  solid3DEulerDegreesFromQuaternion,
  solid3DModelQuaternion,
  solid3DQuaternionFromEulerDegrees,
  transformSolid3DSectionForProjection,
  withSolid3DModelEulerDegrees,
  type Solid3DRecord,
} from "../../../../src/core/public";

const record = {
  boardObjectIds: [],
  definition: { edgeLength: 2, kind: "cube" },
  id: "solid:transform",
  points: [],
  projection: defaultSolidProjection,
  rootGroupId: "group:transform",
  schemaVersion: "1.0",
  sections: [],
  source: { kind: "text-template", templateId: "cube" },
} as Solid3DRecord;

describe("persistent solid model transform", () => {
  it("treats legacy six-value projections as identity rotation", () => {
    expect(solid3DModelQuaternion(record)).toEqual(identitySolid3DQuaternion);
  });

  it("round-trips Euler orientation through a normalized quaternion", () => {
    const quaternion = solid3DQuaternionFromEulerDegrees({ x: 30, y: 20, z: -15 });
    const euler = solid3DEulerDegreesFromQuaternion(quaternion);
    expect(euler.x).toBeCloseTo(30, 8);
    expect(euler.y).toBeCloseTo(20, 8);
    expect(euler.z).toBeCloseTo(-15, 8);
  });

  it("persists rotation additively without changing projection coefficients", () => {
    const rotated = withSolid3DModelEulerDegrees(record, { x: 0, y: 0, z: 90 });
    expect(rotated.projection.matrix.slice(0, 6)).toEqual(
      defaultSolidProjection.matrix,
    );
    expect(rotated.projection.matrix).toHaveLength(10);
    const point = applySolid3DQuaternion(
      { x: 1, y: 0, z: 0 },
      solid3DModelQuaternion(rotated),
    );
    expect(point.x).toBeCloseTo(0, 8);
    expect(point.y).toBeCloseTo(1, 8);
    expect(point.z).toBeCloseTo(0, 8);
  });

  it("rotates projected section vertices while preserving metric invariants", () => {
    const rotated = withSolid3DModelEulerDegrees(record, { x: 90, y: 0, z: 0 });
    const section = transformSolid3DSectionForProjection(rotated, {
      area: 2,
      intersections: 3,
      perimeter: 6,
      vertices: [
        { x: 0, y: 1, z: 0 },
        { x: 1, y: 1, z: 0 },
        { x: 0, y: 2, z: 0 },
      ],
    });
    expect(section.area).toBe(2);
    expect(section.perimeter).toBe(6);
    expect(section.vertices[0]?.z).toBeCloseTo(1, 8);
  });
});
