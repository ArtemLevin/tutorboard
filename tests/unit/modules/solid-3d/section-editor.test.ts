import { describe, expect, it } from "vitest";

import {
  defaultSolidProjection,
  solidPointId,
  type Solid3DRecord,
} from "../../../../src/core/public";
import {
  removeSavedSolidSection,
  saveConstrainedSolidSection,
  saveSolidSectionFromPoints,
} from "../../../../src/modules/solid-3d/public";

const points = [
  {
    anchor: { kind: "vertex" as const, vertexId: "vertex:0" },
    id: solidPointId("solid-point:editor-a"),
    label: "A",
    position: { x: -1, y: -1, z: -1 },
  },
  {
    anchor: { kind: "vertex" as const, vertexId: "vertex:1" },
    id: solidPointId("solid-point:editor-b"),
    label: "B",
    position: { x: 1, y: -1, z: -1 },
  },
  {
    anchor: { kind: "vertex" as const, vertexId: "vertex:6" },
    id: solidPointId("solid-point:editor-c"),
    label: "C",
    position: { x: 1, y: 1, z: 1 },
  },
];

const record = {
  boardObjectIds: [],
  definition: { edgeLength: 2, kind: "cube" },
  id: "solid:section-editor",
  points,
  projection: defaultSolidProjection,
  rootGroupId: "group:section-editor",
  schemaVersion: "1.0",
  sections: [],
  source: { kind: "text-template", templateId: "cube" },
} as Solid3DRecord;

describe("explicit solid section editor", () => {
  it("saves a three-point preview only when requested", () => {
    expect(record.sections).toHaveLength(0);
    const result = saveSolidSectionFromPoints({
      pointIds: [points[0]!.id, points[1]!.id, points[2]!.id],
      record,
      token: "explicit",
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.record.sections).toHaveLength(1);
    expect(result.section.area).toBeGreaterThan(0);
  });

  it("materializes constrained helper points and removes them with the section", () => {
    const result = saveConstrainedSolidSection({
      constraint: {
        faceId: "face:0",
        kind: "through-point-parallel-face",
        pointId: points[2]!.id,
      },
      record,
      token: "parallel-face",
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.record.points.length).toBe(record.points.length + 2);
    const removed = removeSavedSolidSection(result.record, result.sectionId);
    expect(removed.sections).toHaveLength(0);
    expect(removed.points).toEqual(record.points);
  });

  it("reuses an already saved three-point section", () => {
    const first = saveSolidSectionFromPoints({
      pointIds: [points[0]!.id, points[1]!.id, points[2]!.id],
      record,
      token: "first",
    });
    expect(first.status).toBe("ok");
    if (first.status !== "ok") return;
    const second = saveSolidSectionFromPoints({
      pointIds: [points[2]!.id, points[0]!.id, points[1]!.id],
      record: first.record,
      token: "second",
    });
    expect(second.status).toBe("ok");
    if (second.status !== "ok") return;
    expect(second.record.sections).toHaveLength(1);
    expect(second.sectionId).toBe(first.sectionId);
  });
});
