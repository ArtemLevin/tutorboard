import { describe, expect, it } from "vitest";

import {
  canonicalizeTopologyFaceAnchor,
  createSolidTopology,
  defaultSolidProjection,
  reprojectSolid3DRecord,
  resolveSolid3DPointPosition,
  resolveSolidPointAnchor,
  solid3DId,
  solidPointId,
  type Solid3DRecord,
  type Vec3,
} from "../../../../src/core/public";

function interpolateTriangle(
  first: Vec3,
  second: Vec3,
  third: Vec3,
  x: number,
  y: number,
): Vec3 {
  return {
    x: first.x + (second.x - first.x) * x + (third.x - first.x) * y,
    y: first.y + (second.y - first.y) * x + (third.y - first.y) * y,
    z: first.z + (second.z - first.z) * x + (third.z - first.z) * y,
  };
}

function baseRecord(definition: Solid3DRecord["definition"]): Solid3DRecord {
  return {
    boardObjectIds: [],
    definition,
    id: solid3DId("solid:topology-anchor"),
    points: [],
    projection: defaultSolidProjection,
    rootGroupId: "group:topology-anchor" as never,
    schemaVersion: "1.0",
    sections: [],
    source: { kind: "text-template", templateId: "cube" },
  };
}

describe("stable topology anchors", () => {
  it("stores the exact fan triangle and barycentric coordinates", () => {
    const topology = createSolidTopology({ edgeLength: 2, kind: "cube" })!;
    const face = topology.faces[0]!;
    const vertices = new Map(
      topology.vertices.map((vertex) => [vertex.id, vertex.position]),
    );
    const first = vertices.get(face.vertexIds[0]!)!;
    const second = vertices.get(face.vertexIds[2]!)!;
    const third = vertices.get(face.vertexIds[3]!)!;
    const hit = interpolateTriangle(first, second, third, 0.23, 0.31);

    const placement = canonicalizeTopologyFaceAnchor(topology, hit, 1);
    expect(placement).not.toBeNull();
    expect(placement?.anchor).toMatchObject({
      faceId: face.id,
      kind: "face",
      triangleIndex: 1,
    });
    expect(placement?.anchor.localCoordinates.x).toBeCloseTo(0.23, 10);
    expect(placement?.anchor.localCoordinates.y).toBeCloseTo(0.31, 10);
    expect(resolveSolidPointAnchor(topology, placement!.anchor)).toEqual(
      placement!.position,
    );
  });

  it("reprojects vertex, edge and stable face anchors after resizing", () => {
    const definition = { edgeLength: 2, kind: "cube" } as const;
    const topology = createSolidTopology(definition)!;
    const face = topology.faces[0]!;
    const vertices = new Map(
      topology.vertices.map((vertex) => [vertex.id, vertex.position]),
    );
    const faceHit = interpolateTriangle(
      vertices.get(face.vertexIds[0]!)!,
      vertices.get(face.vertexIds[2]!)!,
      vertices.get(face.vertexIds[3]!)!,
      0.2,
      0.35,
    );
    const facePlacement = canonicalizeTopologyFaceAnchor(topology, faceHit, 1)!;
    const edge = topology.edges[0]!;
    const record: Solid3DRecord = {
      ...baseRecord(definition),
      points: [
        {
          anchor: { kind: "vertex", vertexId: topology.vertices[0]!.id },
          id: solidPointId("solid-point:vertex"),
          label: "A",
          position: topology.vertices[0]!.position,
        },
        {
          anchor: { edgeId: edge.id, kind: "edge", parameter: 0.25 },
          id: solidPointId("solid-point:edge"),
          label: "B",
          position: resolveSolidPointAnchor(topology, {
            edgeId: edge.id,
            kind: "edge",
            parameter: 0.25,
          })!,
        },
        {
          anchor: facePlacement.anchor,
          id: solidPointId("solid-point:face"),
          label: "C",
          position: facePlacement.position,
        },
      ],
    };

    const resized = reprojectSolid3DRecord(record, {
      edgeLength: 4,
      kind: "cube",
    });
    record.points.forEach((point, index) => {
      const next = resized.points[index]!;
      expect(next.position.x).toBeCloseTo(point.position.x * 2, 10);
      expect(next.position.y).toBeCloseTo(point.position.y * 2, 10);
      expect(next.position.z).toBeCloseTo(point.position.z * 2, 10);
    });
  });

  it("keeps legacy face anchors at their stored Cartesian position", () => {
    const stored = { x: 0.37, y: -1, z: 0.42 };
    const point = {
      anchor: {
        faceId: "face:0",
        kind: "face" as const,
        localCoordinates: { x: 0, y: 0 },
      },
      id: solidPointId("solid-point:legacy-face"),
      label: "L",
      position: stored,
    };
    expect(
      resolveSolid3DPointPosition({ edgeLength: 8, kind: "cube" }, point),
    ).toEqual(stored);
  });
});
