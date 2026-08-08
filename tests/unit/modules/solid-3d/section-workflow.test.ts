import { describe, expect, it } from "vitest";

import {
  defaultSolidProjection,
  solid3DId,
  solidPointId,
  type Solid3DPoint,
  type Solid3DRecord,
} from "../../../../src/core/public";
import { calculateSolidSection } from "../../../../src/modules/solid-3d/public";

const pointIds = [
  solidPointId("solid-point:a"),
  solidPointId("solid-point:b"),
  solidPointId("solid-point:c"),
] as const;

function semanticPoint(
  index: number,
  parameters: readonly number[],
): Solid3DPoint {
  return {
    anchor: {
      kind: "analytic-surface",
      parameters,
      surfaceId: "surface:sphere",
    },
    id: pointIds[index]!,
    label: String.fromCharCode(65 + index),
    position: { x: 0, y: 0, z: 0 },
  };
}

describe("calculateSolidSection semantic analytic points", () => {
  it("uses anchors when stored Cartesian coordinates are stale", () => {
    const record: Solid3DRecord = {
      boardObjectIds: [],
      definition: { kind: "sphere", radius: 4 },
      id: solid3DId("solid:semantic-section"),
      points: [
        semanticPoint(0, [0, Math.PI / 2]),
        semanticPoint(1, [Math.PI / 2, Math.PI / 2]),
        semanticPoint(2, [0, 0]),
      ],
      projection: defaultSolidProjection,
      rootGroupId: "group:semantic-section" as never,
      schemaVersion: "1.0",
      sections: [],
      source: { kind: "text-template", templateId: "sphere" },
    };

    const result = calculateSolidSection(record, pointIds);
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.section.vertices.length).toBeGreaterThan(20);
      expect(result.section.area).toBeGreaterThan(0);
      expect(result.section.perimeter).toBeGreaterThan(0);
    }
  });
});
