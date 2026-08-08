import { describe, expect, it } from "vitest";

import {
  defaultSolidProjection,
  solid3DId,
  solidPointId,
  validateSolid3DRecord,
  type Solid3DRecord,
} from "../../../../src/core/public";

function hemisphereRecord(surfaceId: string): Solid3DRecord {
  return {
    boardObjectIds: [],
    definition: { kind: "hemisphere", radius: 2 },
    id: solid3DId(`solid:${surfaceId}`),
    points: [
      {
        anchor: {
          kind: "analytic-surface",
          parameters: [1, 0, 0],
          surfaceId,
        },
        id: solidPointId(`point:${surfaceId}`),
        label: "A",
        position: { x: 1, y: 0, z: 0 },
      },
    ],
    projection: defaultSolidProjection,
    rootGroupId: "group:test" as never,
    schemaVersion: "1.0",
    sections: [],
    source: { kind: "text-template", templateId: "hemisphere" },
  };
}

describe("validateSolid3DRecord analytic anchors", () => {
  it("accepts both legacy and semantic hemisphere surface ids", () => {
    expect(validateSolid3DRecord(hemisphereRecord("surface:0"))).toEqual([]);
    expect(
      validateSolid3DRecord(hemisphereRecord("surface:hemisphere-base")),
    ).toEqual([]);
  });

  it("rejects unknown analytic surface ids", () => {
    expect(validateSolid3DRecord(hemisphereRecord("surface:unknown"))).toEqual([
      expect.objectContaining({ code: "solid.invalid-reference" }),
    ]);
  });
});
