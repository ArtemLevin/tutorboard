import { describe, expect, it } from "vitest";

import {
  createSolidTopology,
  defaultSolidProjection,
  materializeSolidSectionConstraint,
  planeFromThreePoints,
  reprojectSolid3DRecord,
  resolveSolid3DPointPosition,
  solidPointId,
  type Solid3DPoint,
  type Solid3DRecord,
} from "../../../../src/core/public";

const point = {
  anchor: { kind: "vertex", vertexId: "vertex:6" },
  id: solidPointId("solid-point:constraint-origin"),
  label: "P",
  position: { x: 1, y: 1, z: 1 },
} as Solid3DPoint;

const record = {
  boardObjectIds: [],
  definition: { edgeLength: 2, kind: "cube" },
  id: "solid:constraints",
  points: [point],
  projection: defaultSolidProjection,
  rootGroupId: "group:constraints",
  schemaVersion: "1.0",
  sections: [],
  source: { kind: "text-template", templateId: "cube" },
} as Solid3DRecord;

const normalizedAbsDot = (
  left: { x: number; y: number; z: number },
  right: { x: number; y: number; z: number },
): number => {
  const denominator =
    Math.hypot(left.x, left.y, left.z) * Math.hypot(right.x, right.y, right.z);
  return Math.abs(
    (left.x * right.x + left.y * right.y + left.z * right.z) / denominator,
  );
};

describe("semantic constrained section planes", () => {
  it("materializes a plane through an edge and a selected point with semantic vertex helpers", () => {
    const result = materializeSolidSectionConstraint({
      constraint: {
        edgeId: "edge:0:3",
        kind: "through-edge-and-point",
        pointId: point.id,
      },
      origin: point.position,
      record,
      token: "edge-point",
    });
    expect(result).not.toBeNull();
    expect(result?.helperPoints.map(({ anchor }) => anchor.kind)).toEqual([
      "vertex",
      "vertex",
    ]);
  });

  it("keeps a parallel-face plane parallel after nonuniform resize", () => {
    const materialized = materializeSolidSectionConstraint({
      constraint: {
        faceId: "face:0",
        kind: "through-point-parallel-face",
        pointId: point.id,
      },
      origin: point.position,
      record,
      token: "parallel-face",
    });
    expect(materialized).not.toBeNull();
    if (materialized === null) return;
    const withSection: Solid3DRecord = {
      ...record,
      points: [...record.points, ...materialized.helperPoints],
      sections: [materialized.section],
    };
    const resized = reprojectSolid3DRecord(withSection, {
      kind: "cuboid",
      size: { x: 5, y: 3, z: 1.5 },
    });
    const selected = resized.points.find(({ id }) => id === point.id)!;
    const helpers = materialized.helperPoints.map(
      ({ id }) => resized.points.find((candidate) => candidate.id === id)!,
    );
    const plane = planeFromThreePoints(
      resolveSolid3DPointPosition(resized.definition, selected),
      helpers[0]!.position,
      helpers[1]!.position,
    );
    const topology = createSolidTopology(resized.definition)!;
    const face = topology.faces.find(({ id }) => id === "face:0")!;
    const vertices = new Map(
      topology.vertices.map((vertex) => [vertex.id, vertex.position]),
    );
    const a = vertices.get(face.vertexIds[0]!)!;
    const b = vertices.get(face.vertexIds[1]!)!;
    const c = vertices.get(face.vertexIds[2]!)!;
    const facePlane = planeFromThreePoints(a, b, c)!;
    expect(plane).not.toBeNull();
    expect(normalizedAbsDot(plane!.normal, facePlane.normal)).toBeCloseTo(1, 8);
  });

  it("regenerates a perpendicular-edge plane from the resized edge direction", () => {
    const materialized = materializeSolidSectionConstraint({
      constraint: {
        edgeId: "edge:0:1",
        kind: "through-point-perpendicular-edge",
        pointId: point.id,
      },
      origin: point.position,
      record,
      token: "perpendicular-edge",
    });
    expect(materialized).not.toBeNull();
    if (materialized === null) return;
    const resized = reprojectSolid3DRecord(
      {
        ...record,
        points: [...record.points, ...materialized.helperPoints],
        sections: [materialized.section],
      },
      { kind: "cuboid", size: { x: 6, y: 2, z: 3 } },
    );
    const selected = resized.points.find(({ id }) => id === point.id)!;
    const helperPoints = materialized.helperPoints.map(
      ({ id }) => resized.points.find((candidate) => candidate.id === id)!,
    );
    const plane = planeFromThreePoints(
      resolveSolid3DPointPosition(resized.definition, selected),
      helperPoints[0]!.position,
      helperPoints[1]!.position,
    )!;
    const topology = createSolidTopology(resized.definition)!;
    const edge = topology.edges.find(({ id }) => id === "edge:0:1")!;
    const vertices = new Map(
      topology.vertices.map((vertex) => [vertex.id, vertex.position]),
    );
    const start = vertices.get(edge.startVertexId)!;
    const end = vertices.get(edge.endVertexId)!;
    expect(
      normalizedAbsDot(plane.normal, {
        x: end.x - start.x,
        y: end.y - start.y,
        z: end.z - start.z,
      }),
    ).toBeCloseTo(1, 8);
  });

  it("supports analytic planes parallel to a cylinder base", () => {
    const cylinder = {
      ...record,
      definition: { height: 4, kind: "cylinder", radius: 2 },
      points: [
        {
          anchor: {
            kind: "analytic-surface",
            parameters: [0, 0.5],
            surfaceId: "surface:cylinder-side",
          },
          id: solidPointId("solid-point:cylinder-origin"),
          label: "P",
          position: { x: 2, y: 0, z: 0 },
        },
      ],
    } as Solid3DRecord;
    const origin = cylinder.points[0]!;
    const result = materializeSolidSectionConstraint({
      constraint: {
        kind: "through-point-parallel-surface",
        pointId: origin.id,
        surfaceId: "surface:cylinder-top",
      },
      origin: origin.position,
      record: cylinder,
      token: "analytic-parallel",
    });
    expect(result).not.toBeNull();
    expect(result?.helperPoints.every(({ position }) => position.y === 0)).toBe(
      true,
    );
  });
});
