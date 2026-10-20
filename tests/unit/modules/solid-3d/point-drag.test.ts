import { describe, expect, it } from "vitest";

import {
  createSolidTopology,
  defaultSolidProjection,
  resolveSolidPointAnchor,
  solid3DId,
  solidPointId,
  type Solid3DRecord,
  type SolidPointAnchor,
} from "../../../../src/core/public";
import { applySolidPointDrag, calculateSolidSection } from "../../../../src/modules/solid-3d/public";

const definition = { edgeLength: 2, kind: "cube" } as const;
const topology = createSolidTopology(definition)!;
const edgeId = topology.edges[0]!.id;
const anchor: SolidPointAnchor = { kind: "edge", edgeId, parameter: 0.25 };
const newAnchor: SolidPointAnchor = { kind: "edge", edgeId, parameter: 0.75 };
const pointId = solidPointId("solid-point:dragged");

function record(): Solid3DRecord {
  return {
    boardObjectIds: [],
    definition,
    id: solid3DId("solid:point-drag"),
    rootGroupId: "group:point-drag" as never,
    projection: defaultSolidProjection,
    points: [
      {
        id: pointId,
        label: "P",
        anchor,
        position: resolveSolidPointAnchor(topology, anchor)!,
      },
    ],
    sections: [],
    source: { kind: "text-template", templateId: "cube" },
    schemaVersion: "1.0",
  };
}

describe("committing a dragged anchored point", () => {
  it("updates the same semantic point while retaining unrelated remote changes", () => {
    const initial = record();
    const anotherPoint = {
      id: solidPointId("solid-point:remote"),
      label: "Remote",
      anchor: { kind: "vertex" as const, vertexId: topology.vertices[2]!.id },
      position: topology.vertices[2]!.position,
    };
    const current = { ...initial, points: [...initial.points, anotherPoint] };
    const position = resolveSolidPointAnchor(topology, newAnchor)!;
    const result = applySolidPointDrag(current, initial, pointId, position, newAnchor);
    expect(result?.points).toHaveLength(2);
    expect(result?.points[0]?.anchor).toEqual(newAnchor);
    expect(result?.points[0]?.position).toEqual(position);
    expect(result?.points[1]).toEqual(anotherPoint);
    expect(current.points[0]?.anchor).toEqual(anchor);
  });

  it("rejects stale gestures, changes of definition, and no-op moves", () => {
    const original = record();
    const position = resolveSolidPointAnchor(topology, newAnchor)!;
    const changed = {
      ...original,
      points: [{ ...original.points[0]!, label: "Concurrent edit" }],
    };
    expect(applySolidPointDrag(changed, original, pointId, position, newAnchor)).toBeNull();
    expect(
      applySolidPointDrag(
        { ...original, definition: { kind: "cube", edgeLength: 3 } },
        original,
        pointId,
        position,
        newAnchor,
      ),
    ).toBeNull();
    expect(
      applySolidPointDrag(original, original, pointId, original.points[0]!.position, anchor),
    ).toBeNull();
    expect(
      applySolidPointDrag(original, original, pointId, { x: NaN, y: 0, z: 0 }, newAnchor),
    ).toBeNull();
  });

  it("updates the live section calculated from dragged anchor positions", () => {
    const initial = record();
    const extra = [topology.vertices[3]!, topology.vertices[6]!].map(
      (vertex, index) => ({
        id: solidPointId("solid-point:fixed-" + String(index)),
        label: "F" + String(index),
        anchor: { kind: "vertex" as const, vertexId: vertex.id },
        position: vertex.position,
      }),
    );
    const candidate: Solid3DRecord = { ...initial, points: [...initial.points, ...extra] };
    const ids = candidate.points.map(({ id }) => id) as [
      typeof pointId,
      typeof pointId,
      typeof pointId,
    ];
    const before = calculateSolidSection(candidate, ids);
    const moved = applySolidPointDrag(
      candidate,
      candidate,
      pointId,
      resolveSolidPointAnchor(topology, newAnchor)!,
      newAnchor,
    )!;
    const after = calculateSolidSection(moved, ids);
    expect(before.status).toBe("ok");
    expect(after.status).toBe("ok");
    if (before.status === "ok" && after.status === "ok") {
      expect(before.section.vertices).not.toEqual(after.section.vertices);
    }
  });
});
