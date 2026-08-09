import { describe, expect, it } from "vitest";

import {
  defaultSolidProjection,
  groupId,
  reprojectSolid3DRecord,
  solid3DId,
  solidPointId,
  validateSolid3DRecord,
  type Solid3DRecord,
} from "../../../../src/core/public";
import { saveConstrainedSolidSection } from "../../../../src/modules/solid-3d/public";

const cylinder: Solid3DRecord = {
  boardObjectIds: [],
  definition: { height: 4, kind: "cylinder", radius: 2 },
  id: solid3DId("solid:constraint-validation"),
  points: [
    {
      anchor: {
        kind: "analytic-surface",
        parameters: [0, 0.5],
        surfaceId: "surface:cylinder-side",
      },
      id: solidPointId("solid-point:constraint-validation-origin"),
      label: "P",
      position: { x: 2, y: 0, z: 0 },
    },
  ],
  projection: defaultSolidProjection,
  rootGroupId: groupId("group:constraint-validation"),
  schemaVersion: "1.0",
  sections: [],
  source: { kind: "text-template", templateId: "cylinder" },
};

describe("constrained section record validation", () => {
  it("keeps analytic helper records valid before and after resize", () => {
    const result = saveConstrainedSolidSection({
      constraint: {
        kind: "through-point-parallel-surface",
        pointId: cylinder.points[0]!.id,
        surfaceId: "surface:cylinder-top",
      },
      record: cylinder,
      token: "analytic-validation",
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(validateSolid3DRecord(result.record)).toEqual([]);

    const resized = reprojectSolid3DRecord(result.record, {
      height: 7,
      kind: "cylinder",
      radius: 3.5,
    });
    expect(validateSolid3DRecord(resized)).toEqual([]);
  });
});
