import { describe, expect, it } from "vitest";

import {
  createSolidTopology,
  defaultSolidProjection,
  solid3DId,
  solidPointId,
  updateSolidParameter,
  type Solid3DRecord,
} from "../../../../src/core/public";
import { calculateSolidSection } from "../../../../src/modules/solid-3d/public";

const pointIds = [
  solidPointId("solid-point:resize-a"),
  solidPointId("solid-point:resize-b"),
  solidPointId("solid-point:resize-c"),
] as const;

describe("solid section resize semantics", () => {
  it("recalculates a topology section from semantic anchors", () => {
    const definition = { edgeLength: 2, kind: "cube" } as const;
    const topology = createSolidTopology(definition)!;
    const face = topology.faces[0]!;
    const record: Solid3DRecord = {
      boardObjectIds: [],
      definition,
      id: solid3DId("solid:resize-section"),
      points: face.vertexIds.slice(0, 3).map((vertexId, index) => ({
        anchor: { kind: "vertex" as const, vertexId },
        id: pointIds[index]!,
        label: String.fromCharCode(65 + index),
        position: { x: 0, y: 0, z: 0 },
      })),
      projection: defaultSolidProjection,
      rootGroupId: "group:resize-section" as never,
      schemaVersion: "1.0",
      sections: [],
      source: { kind: "text-template", templateId: "cube" },
    };

    const before = calculateSolidSection(record, pointIds);
    expect(before.status).toBe("ok");
    const resized = updateSolidParameter(record, "edgeLength", 4)!;
    const after = calculateSolidSection(resized, pointIds);
    expect(after.status).toBe("ok");
    if (before.status === "ok" && after.status === "ok") {
      expect(before.section.area).toBeCloseTo(4, 8);
      expect(after.section.area).toBeCloseTo(16, 8);
      expect(after.section.perimeter).toBeCloseTo(
        before.section.perimeter * 2,
        8,
      );
    }
  });
});
