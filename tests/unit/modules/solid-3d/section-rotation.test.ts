import { describe, expect, it } from "vitest";

import {
  createSolidTopology,
  defaultSolidProjection,
  groupId,
  resolveSolidPointAnchor,
  signedDistanceToPlane,
  solid3DId,
  solidPointId,
  validateSolid3DRecord,
  type Solid3DPoint,
  type Solid3DRecord,
} from "../../../../src/core/public";
import {
  calculateSolidSection,
  removeSavedSolidSection,
} from "../../../../src/modules/solid-3d/public";
import {
  getSolidSectionRotationFrame,
  getSolidSectionRotationFrameForAxis,
  previewSolidSectionRotation,
  previewSolidSectionRotationAboutAxis,
  saveSolidSectionRotation,
  saveSolidSectionRotationAboutAxis,
} from "../../../../src/modules/solid-3d/section-rotation";

const definition = { kind: "cube", edgeLength: 2 } as const;
const topology = createSolidTopology(definition)!;
const vertexMap = new Map(
  topology.vertices.map(({ id, position }) => [id, position]),
);
const verticalEdges = topology.edges.filter(
  ({ startVertexId, endVertexId }) =>
    Math.abs(vertexMap.get(startVertexId)!.y - vertexMap.get(endVertexId)!.y) >
    1.5,
);
const horizontalEdge = topology.edges.find(({ startVertexId, endVertexId }) => {
  const start = vertexMap.get(startVertexId)!;
  const end = vertexMap.get(endVertexId)!;
  return Math.abs(start.x - end.x) > 1.5 && start.y === -1;
})!;
const points: Solid3DPoint[] = verticalEdges.slice(0, 3).map((edge, index) => {
  const anchor = { kind: "edge" as const, edgeId: edge.id, parameter: 0.5 };
  return {
    anchor,
    id: solidPointId(`solid-point:rot-origin:${index}`),
    label: `P${index}`,
    position: resolveSolidPointAnchor(topology, anchor)!,
  };
});
const ids = [points[0]!.id, points[1]!.id, points[2]!.id] as const;

function record(): Solid3DRecord {
  return {
    boardObjectIds: [],
    definition,
    id: solid3DId("solid:rotation-test"),
    rootGroupId: groupId("group:rotation-test"),
    projection: defaultSolidProjection,
    points,
    sections: [],
    source: { kind: "text-template", templateId: "cube" },
    schemaVersion: "1.0",
  };
}

describe("3D section rotation around a selected edge", () => {
  it("rotates the cutting plane and preserves distance to the selected axis", () => {
    const initial = record();
    const frame = getSolidSectionRotationFrame(initial, ids, horizontalEdge.id);
    expect(frame).not.toBeNull();
    const zero = previewSolidSectionRotation(
      initial,
      ids,
      horizontalEdge.id,
      0,
    );
    const moved = previewSolidSectionRotation(
      initial,
      ids,
      horizontalEdge.id,
      15,
    );
    expect(zero?.section?.area).toBeCloseTo(4, 6);
    expect(moved?.section).not.toBeNull();
    expect(moved?.section?.vertices).not.toEqual(zero?.section?.vertices);
    if (frame === null || moved === null || moved.section === null) return;
    expect(signedDistanceToPlane(moved.plane, frame.axisStart)).toBeCloseTo(
      signedDistanceToPlane(frame.plane, frame.axisStart),
      6,
    );
    for (const vertex of moved.section.vertices) {
      expect(Math.abs(signedDistanceToPlane(moved.plane, vertex))).toBeLessThan(
        1e-6,
      );
    }
    expect(initial.points).toHaveLength(3);
  });

  it("rejects invalid angles, nonexistent axes, and unsupported analytic bodies", () => {
    const initial = record();
    for (const angle of [Number.NaN, Number.POSITIVE_INFINITY, -181, 181]) {
      expect(
        previewSolidSectionRotation(initial, ids, horizontalEdge.id, angle),
      ).toBeNull();
    }
    expect(
      previewSolidSectionRotation(initial, ids, "edge:missing", 30),
    ).toBeNull();
    expect(
      previewSolidSectionRotation(
        { ...initial, definition: { kind: "sphere", radius: 1 } },
        ids,
        horizontalEdge.id,
        20,
      ),
    ).toBeNull();
    expect(
      saveSolidSectionRotation({
        current: initial,
        starting: initial,
        pointIds: ids,
        edgeId: horizontalEdge.id,
        angleDegrees: 0,
        token: "noop",
      }),
    ).toMatchObject({ status: "error", code: "outside" });
  });

  it("saves a valid rotated polygon as ordinary anchored section and cleans up on delete", () => {
    const initial = record();
    const result = saveSolidSectionRotation({
      current: initial,
      starting: initial,
      pointIds: ids,
      edgeId: horizontalEdge.id,
      angleDegrees: 15,
      token: "captured",
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.record.points).toHaveLength(6);
    expect(result.record.sections).toHaveLength(1);
    expect(
      result.record.points
        .slice(3)
        .every(({ id }) =>
          id.startsWith("solid-point:section-helper:rotation:"),
        ),
    ).toBe(true);
    expect(validateSolid3DRecord(result.record)).toEqual([]);
    const recalculated = calculateSolidSection(result.record, result.pointIds);
    expect(recalculated.status).toBe("ok");
    if (recalculated.status === "ok") {
      expect(recalculated.section.area).toBeCloseTo(result.section.area, 5);
      expect(recalculated.section.perimeter).toBeCloseTo(
        result.section.perimeter,
        5,
      );
    }
    const deleted = removeSavedSolidSection(result.record, result.sectionId);
    expect(deleted.sections).toHaveLength(0);
    expect(deleted.points).toEqual(initial.points);
  });

  it("preserves independent collaboration edits and rejects conflicting sources", () => {
    const starting = record();
    const newRemotePoint = {
      ...starting.points[0]!,
      id: solidPointId("solid-point:remote-rotation"),
      label: "Remote",
    };
    const current = {
      ...starting,
      points: [...starting.points, newRemotePoint],
    };
    const accepted = saveSolidSectionRotation({
      current,
      starting,
      pointIds: ids,
      edgeId: horizontalEdge.id,
      angleDegrees: -12,
      token: "remote",
    });
    expect(accepted.status).toBe("ok");
    if (accepted.status === "ok") {
      expect(accepted.record.points).toContainEqual(newRemotePoint);
    }
    const conflicted = {
      ...current,
      points: current.points.map((point) =>
        point.id === ids[0] ? { ...point, label: "Modified" } : point,
      ),
    };
    expect(
      saveSolidSectionRotation({
        current: conflicted,
        starting,
        pointIds: ids,
        edgeId: horizontalEdge.id,
        angleDegrees: 15,
        token: "conflict",
      }),
    ).toMatchObject({ status: "error", code: "invalid-source" });
    expect(
      saveSolidSectionRotation({
        current: { ...starting, definition: { kind: "cube", edgeLength: 3 } },
        starting,
        pointIds: ids,
        edgeId: horizontalEdge.id,
        angleDegrees: 15,
        token: "changed-model",
      }),
    ).toMatchObject({ status: "error", code: "invalid-source" });
  });

  it("enforces section and point limits before adding helper anchors", () => {
    const starting = record();
    const crowded = {
      ...starting,
      points: [
        ...starting.points,
        ...Array.from({ length: 27 }, (_, index) => ({
          ...starting.points[0]!,
          id: solidPointId(`solid-point:extra-rotation:${index}`),
        })),
      ],
    };
    expect(
      saveSolidSectionRotation({
        current: crowded,
        starting,
        pointIds: ids,
        edgeId: horizontalEdge.id,
        angleDegrees: 15,
        token: "limit",
      }),
    ).toMatchObject({ status: "error", code: "limit" });
  });
});

describe("rotation around two semantic 3D points", () => {
  const axisIds = [points[0]!.id, points[1]!.id] as const;
  const axis = { kind: "points" as const, pointIds: axisIds };

  it("keeps the selected axis fixed and computes the rotated section", () => {
    const initial = record();
    const frame = getSolidSectionRotationFrameForAxis(initial, ids, axis);
    const preview = previewSolidSectionRotationAboutAxis(initial, ids, axis, 15);
    expect(frame).not.toBeNull();
    expect(preview?.section).not.toBeNull();
    if (frame === null || preview === null || preview.section === null) return;
    expect(signedDistanceToPlane(preview.plane, frame.axisStart)).toBeCloseTo(0, 6);
    expect(signedDistanceToPlane(preview.plane, frame.axisEnd)).toBeCloseTo(0, 6);
    expect(preview.section.area).toBeGreaterThan(0);
    expect(
      preview.section.vertices.every(
        (vertex) => Math.abs(signedDistanceToPlane(preview.plane, vertex)) < 1e-6,
      ),
    ).toBe(true);
  });

  it("rejects missing, identical, and coincident axis points", () => {
    const initial = record();
    expect(getSolidSectionRotationFrameForAxis(initial, ids, {
      kind: "points", pointIds: [axisIds[0], axisIds[0]],
    })).toBeNull();
    expect(getSolidSectionRotationFrameForAxis(initial, ids, {
      kind: "points", pointIds: [axisIds[0], solidPointId("solid-point:missing")],
    })).toBeNull();
    const duplicate = {
      ...initial,
      points: [
        ...initial.points,
        { ...initial.points[0]!, id: solidPointId("solid-point:coincident") },
      ],
    };
    expect(getSolidSectionRotationFrameForAxis(duplicate, ids, {
      kind: "points", pointIds: [axisIds[0], solidPointId("solid-point:coincident")],
    })).toBeNull();
  });

  it("captures a two-point rotation and removes its helper anchors on delete", () => {
    const initial = record();
    const saved = saveSolidSectionRotationAboutAxis({
      current: initial,
      starting: initial,
      pointIds: ids,
      axis,
      angleDegrees: 15,
      token: "two-point",
    });
    expect(saved.status).toBe("ok");
    if (saved.status !== "ok") return;
    expect(saved.record.sections).toHaveLength(1);
    expect(validateSolid3DRecord(saved.record)).toEqual([]);
    const recalculated = calculateSolidSection(saved.record, saved.pointIds);
    expect(recalculated.status).toBe("ok");
    if (recalculated.status === "ok")
      expect(recalculated.section.area).toBeCloseTo(saved.section.area, 5);
    const deleted = removeSavedSolidSection(saved.record, saved.sectionId);
    expect(deleted.sections).toHaveLength(0);
    expect(deleted.points).toEqual(initial.points);
  });

  it("rejects a stale independent axis point but preserves unrelated remote work", () => {
    const starting = record();
    const remoteAxisPoint = {
      ...starting.points[0]!,
      id: solidPointId("solid-point:axis-extra"),
      label: "Q",
      position: topology.vertices[0]!.position,
      anchor: {
        kind: "vertex" as const,
        vertexId: topology.vertices[0]!.id,
      },
    };
    const current = { ...starting, points: [...starting.points, remoteAxisPoint] };
    const extraAxis = {
      kind: "points" as const,
      pointIds: [axisIds[1], remoteAxisPoint.id] as const,
    };
    // The axis point must exist when the drag starts.
    expect(saveSolidSectionRotationAboutAxis({
      current, starting, pointIds: ids, axis: extraAxis,
      angleDegrees: 10, token: "created-remotely",
    })).toMatchObject({ status: "error", code: "invalid-source" });
    const startedWithAxis = current;
    const modified = {
      ...current,
      points: current.points.map((point) =>
        point.id === remoteAxisPoint.id ? { ...point, label: "Changed remotely" } : point,
      ),
    };
    expect(saveSolidSectionRotationAboutAxis({
      current: modified, starting: startedWithAxis, pointIds: ids,
      axis: extraAxis, angleDegrees: 10, token: "stale-axis",
    })).toMatchObject({ status: "error", code: "invalid-source" });
    const unrelated = {
      ...current,
      points: [
        ...current.points,
        { ...starting.points[2]!, id: solidPointId("solid-point:other-edit") },
      ],
    };
    const accepted = saveSolidSectionRotationAboutAxis({
      current: unrelated, starting: startedWithAxis, pointIds: ids,
      axis, angleDegrees: 15, token: "unrelated",
    });
    expect(accepted.status).toBe("ok");
    if (accepted.status === "ok") {
      expect(accepted.record.points.some(({ id }) => id === solidPointId("solid-point:other-edit"))).toBe(true);
    }
  });
});
