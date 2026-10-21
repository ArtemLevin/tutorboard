import { describe, expect, it } from "vitest";

import {
  createSolidTopology,
  defaultSolidProjection,
  groupId,
  isConvexSolidTopology,
  regularBase,
  resolveSolidPointAnchor,
  solid3DId,
  solidPointId,
  type Solid3DPoint,
  type Solid3DRecord,
} from "../../../../src/core/public";
import {
  getSolidSectionRotationFrame,
  previewSolidSectionRotation,
  saveSolidSectionRotation,
} from "../../../../src/modules/solid-3d/section-rotation";
import { getSolidSectionSweepFrame } from "../../../../src/modules/solid-3d/section-sweep";
import { calculateSolidSection } from "../../../../src/modules/solid-3d/section-workflow";

const square = [
  { x: -1, y: -1 },
  { x: 1, y: -1 },
  { x: 1, y: 1 },
  { x: -1, y: 1 },
];
const concave = [
  { x: -1, y: -1 },
  { x: 1, y: -1 },
  { x: 0, y: 0 },
  { x: 1, y: 1 },
  { x: -1, y: 1 },
];

describe("convex polyhedron guard for interactive cutting planes", () => {
  it("accepts supported convex solids, including Platonic polyhedra", () => {
    const definitions = [
      { kind: "cube", edgeLength: 2 },
      { kind: "cuboid", size: { x: 1, y: 2, z: 3 } },
      { kind: "tetrahedron", edgeLength: 2 },
      { kind: "octahedron", edgeLength: 2 },
      { kind: "regular-polyhedron", variant: "dodecahedron", edgeLength: 2 },
      { kind: "regular-polyhedron", variant: "icosahedron", edgeLength: 2 },
      { kind: "prism", base: regularBase(6), height: 3 },
      { kind: "pyramid", base: square, apex: { x: 0, y: 2, z: 0 } },
      {
        kind: "truncated-pyramid",
        bottomBase: regularBase(4, 2),
        topBase: regularBase(4, 1),
        height: 2,
      },
    ] as const;
    for (const definition of definitions) {
      const topology = createSolidTopology(definition);
      expect(topology).not.toBeNull();
      expect(isConvexSolidTopology(topology!)).toBe(true);
    }
  });

  it("rejects concave prisms and pyramids with misleading convex-hull sections", () => {
    for (const definition of [
      { kind: "prism", base: concave, height: 2 },
      { kind: "pyramid", base: concave, apex: { x: 0, y: 2, z: 0 } },
    ] as const) {
      const topology = createSolidTopology(definition)!;
      expect(isConvexSolidTopology(topology)).toBe(false);
    }
  });

  it("rejects a twisted quadrilateral face", () => {
    const topology = createSolidTopology({
      kind: "truncated-pyramid",
      bottomBase: square,
      topBase: [
        { x: -0.5, y: -0.7 },
        { x: 0.5, y: -0.5 },
        { x: 0.5, y: 0.5 },
        { x: -0.5, y: 0.5 },
      ],
      height: 2,
    })!;
    expect(isConvexSolidTopology(topology)).toBe(false);
  });

  it("disables rotate/sweep and persistence for concave geometry", () => {
    const definition = { kind: "prism", base: concave, height: 2 } as const;
    const topology = createSolidTopology(definition)!;
    const positions = new Map(
      topology.vertices.map((vertex) => [vertex.id, vertex.position]),
    );
    const verticalEdges = topology.edges.filter(({ startVertexId, endVertexId }) =>
      Math.abs(positions.get(startVertexId)!.y - positions.get(endVertexId)!.y) > 1.5,
    );
    const points: Solid3DPoint[] = verticalEdges.slice(0, 3).map((edge, index) => {
      const anchor = { kind: "edge" as const, edgeId: edge.id, parameter: 0.5 };
      return {
        id: solidPointId(`solid-point:concave:${index}`),
        label: `P${index}`,
        position: resolveSolidPointAnchor(topology, anchor)!,
        anchor,
      };
    });
    const ids = [points[0]!.id, points[1]!.id, points[2]!.id] as const;
    const record: Solid3DRecord = {
      id: solid3DId("solid:concave"),
      rootGroupId: groupId("group:concave"),
      boardObjectIds: [],
      source: { kind: "text-template", templateId: "prism" },
      projection: defaultSolidProjection,
      schemaVersion: "1.0",
      definition,
      points,
      sections: [],
    };
    const edgeId = topology.edges[0]!.id;
    expect(calculateSolidSection(record, ids)).toMatchObject({
      status: "error",
      code: "solid.section.outside",
    });
    expect(getSolidSectionRotationFrame(record, ids, edgeId)).toBeNull();
    expect(getSolidSectionSweepFrame(record, ids)).toBeNull();
    expect(previewSolidSectionRotation(record, ids, edgeId, 15)).toBeNull();
    expect(saveSolidSectionRotation({
      starting: record,
      current: record,
      pointIds: ids,
      edgeId,
      angleDegrees: 15,
      token: "reject",
    })).toMatchObject({ status: "error", code: "outside" });
  });
});
