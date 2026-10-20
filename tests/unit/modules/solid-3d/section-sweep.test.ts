import { describe, expect, it } from "vitest";

import {
  createSolidTopology,
  defaultSolidProjection,
  resolveSolidPointAnchor,
  solid3DId,
  solidPointId,
  validateSolid3DRecord,
  type Solid3DPoint,
  type Solid3DRecord,
} from "../../../../src/core/public";
import { calculateSolidSection } from "../../../../src/modules/solid-3d/public";
import {
  getSolidSectionSweepFrame,
  previewSolidSectionSweep,
  saveSolidSectionSweep,
} from "../../../../src/modules/solid-3d/section-sweep";

const definition = { kind: "cube", edgeLength: 2 } as const;
const topology = createSolidTopology(definition)!;
const positions = new Map(
  topology.vertices.map((point) => [point.id, point.position]),
);
const verticalEdges = topology.edges.filter((edge) => {
  const a = positions.get(edge.startVertexId)!;
  const b = positions.get(edge.endVertexId)!;
  return Math.abs(a.y - b.y) > 1.5;
});
const points: Solid3DPoint[] = verticalEdges.slice(0, 3).map((edge, index) => {
  const anchor = { kind: "edge" as const, edgeId: edge.id, parameter: 0.5 };
  return {
    id: solidPointId(`solid-point:sweep-origin:${index}`),
    label: `P${index}`,
    anchor,
    position: resolveSolidPointAnchor(topology, anchor)!,
  };
});
const ids = [points[0]!.id, points[1]!.id, points[2]!.id] as const;

function record(): Solid3DRecord {
  return {
    boardObjectIds: [],
    definition,
    id: solid3DId("solid:sweep-test"),
    rootGroupId: "group:sweep" as never,
    projection: defaultSolidProjection,
    points,
    sections: [],
    source: { kind: "text-template", templateId: "cube" },
    schemaVersion: "1.0",
  };
}

describe("parallel section sweep", () => {
  it("computes exact bounds and moves the plane without mutating the record", () => {
    const original = record();
    const frame = getSolidSectionSweepFrame(original, ids);
    expect(frame).not.toBeNull();
    expect(frame!.minOffset).toBeCloseTo(-1);
    expect(frame!.maxOffset).toBeCloseTo(1);
    const initial = previewSolidSectionSweep(original, ids, 0);
    const moved = previewSolidSectionSweep(original, ids, 0.4);
    expect(initial?.section?.area).toBeCloseTo(4);
    expect(moved?.section?.area).toBeCloseTo(4);
    expect(moved?.section?.perimeter).toBeCloseTo(8);
    expect(initial?.section?.vertices).not.toEqual(moved?.section?.vertices);
    expect(original.points).toHaveLength(3);
    expect(previewSolidSectionSweep(original, ids, 3)?.section).toBeNull();
    expect(previewSolidSectionSweep(original, ids, Number.NaN)).toBeNull();
  });

  it("captures a translated plane using three stable semantic anchors", () => {
    const original = record();
    const captured = saveSolidSectionSweep({
      current: original,
      starting: original,
      pointIds: ids,
      offset: 0.4,
      token: "save-one",
    });
    expect(captured.status).toBe("ok");
    if (captured.status !== "ok") return;
    expect(captured.record.points).toHaveLength(6);
    expect(captured.record.sections).toHaveLength(1);
    expect(
      captured.record.points
        .slice(3)
        .every(
          (point) =>
            point.anchor.kind === "edge" || point.anchor.kind === "vertex",
        ),
    ).toBe(true);
    expect(validateSolid3DRecord(captured.record)).toEqual([]);
    const recomputed = calculateSolidSection(
      captured.record,
      captured.pointIds,
    );
    expect(recomputed.status).toBe("ok");
    if (recomputed.status === "ok") {
      expect(recomputed.section.area).toBeCloseTo(captured.section.area, 5);
      expect(recomputed.section.perimeter).toBeCloseTo(
        captured.section.perimeter,
        5,
      );
    }
    expect(original.sections).toHaveLength(0);
  });

  it("rejects stale plane sources without dropping unrelated remote additions", () => {
    const starting = record();
    const concurrent = {
      ...starting,
      points: [
        ...starting.points,
        {
          ...starting.points[0]!,
          id: solidPointId("solid-point:remote"),
          label: "R",
        },
      ],
    };
    const valid = saveSolidSectionSweep({
      current: concurrent,
      starting,
      pointIds: ids,
      offset: -0.25,
      token: "concurrent",
    });
    expect(valid.status).toBe("ok");
    if (valid.status === "ok") expect(valid.record.points).toHaveLength(7);

    const changed = {
      ...concurrent,
      points: concurrent.points.map((point) =>
        point.id === ids[0] ? { ...point, label: "Edited elsewhere" } : point,
      ),
    };
    expect(
      saveSolidSectionSweep({
        current: changed,
        starting,
        pointIds: ids,
        offset: 0.25,
        token: "rejected",
      }),
    ).toMatchObject({ status: "error", code: "invalid-source" });
    expect(
      saveSolidSectionSweep({
        current: starting,
        starting,
        pointIds: ids,
        offset: 5,
        token: "outside",
      }),
    ).toMatchObject({ status: "error", code: "outside" });
  });

  it("enforces the persisted section and point limits", () => {
    const starting = record();
    const tooMany = {
      ...starting,
      points: [
        ...starting.points,
        ...Array.from({ length: 27 }, (_, index) => ({
          ...starting.points[0]!,
          id: solidPointId(`solid-point:other:${index}`),
        })),
      ],
    };
    expect(
      saveSolidSectionSweep({
        current: tooMany,
        starting,
        pointIds: ids,
        offset: 0.25,
        token: "limit",
      }),
    ).toMatchObject({ status: "error", code: "limit" });
  });
});
