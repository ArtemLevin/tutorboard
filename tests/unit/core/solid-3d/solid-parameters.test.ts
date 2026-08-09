import { describe, expect, it } from "vitest";

import {
  defaultSolidProjection,
  solid3DId,
  solidEditableParameters,
  solidPointId,
  updateSolidDefinitionParameter,
  updateSolidParameter,
  type Solid3DRecord,
} from "../../../../src/core/public";

function record(definition: Solid3DRecord["definition"]): Solid3DRecord {
  return {
    boardObjectIds: [],
    definition,
    id: solid3DId("solid:parametric"),
    points: [],
    projection: defaultSolidProjection,
    rootGroupId: "group:parametric" as never,
    schemaVersion: "1.0",
    sections: [],
    source: { kind: "text-template", templateId: definition.kind },
  };
}

describe("solidEditableParameters", () => {
  it("exposes dimensions for every supported solid family", () => {
    expect(
      solidEditableParameters({ edgeLength: 2, kind: "cube" }).map(
        ({ key }) => key,
      ),
    ).toEqual(["edgeLength"]);
    expect(
      solidEditableParameters({
        kind: "cuboid",
        size: { x: 3, y: 2, z: 1 },
      }).map(({ key }) => key),
    ).toEqual(["sizeX", "sizeY", "sizeZ"]);
    expect(
      solidEditableParameters({
        height: 3,
        kind: "truncated-cone",
        bottomRadius: 2,
        topRadius: 1,
      }).map(({ key }) => key),
    ).toEqual(["bottomRadius", "topRadius", "height"]);
    expect(
      solidEditableParameters({
        base: [
          { x: 1, y: 0 },
          { x: 0, y: 1 },
          { x: -1, y: 0 },
        ],
        height: 3,
        kind: "prism",
      }).map(({ key }) => key),
    ).toEqual(["height", "baseRadius"]);
  });

  it("rejects invalid and unsupported parameter updates", () => {
    expect(
      updateSolidDefinitionParameter({ kind: "sphere", radius: 2 }, "radius", 0),
    ).toBeNull();
    expect(
      updateSolidDefinitionParameter(
        { edgeLength: 2, kind: "cube" },
        "height",
        3,
      ),
    ).toBeNull();
  });

  it("scales arbitrary prism bases while preserving their shape", () => {
    const definition = {
      base: [
        { x: 2, y: 0 },
        { x: 0, y: 1 },
        { x: -2, y: 0 },
      ],
      height: 3,
      kind: "prism" as const,
    };
    const updated = updateSolidDefinitionParameter(
      definition,
      "baseRadius",
      4,
    );
    expect(updated?.kind).toBe("prism");
    if (updated?.kind === "prism") {
      expect(updated.base[0]).toEqual({ x: 4, y: 0 });
      expect(updated.base[1]).toEqual({ x: 0, y: 2 });
      expect(updated.base[2]).toEqual({ x: -4, y: 0 });
    }
  });

  it("reprojects semantic analytic points through the editing API", () => {
    const source: Solid3DRecord = {
      ...record({ height: 4, kind: "cylinder", radius: 2 }),
      points: [
        {
          anchor: {
            kind: "analytic-surface",
            parameters: [0, 0.75],
            surfaceId: "surface:cylinder-side",
          },
          id: solidPointId("solid-point:cylinder"),
          label: "A",
          position: { x: 2, y: 1, z: 0 },
        },
      ],
    };
    const resized = updateSolidParameter(source, "radius", 4);
    expect(resized).not.toBeNull();
    expect(resized?.points[0]?.position.x).toBeCloseTo(4, 10);
    expect(resized?.points[0]?.position.y).toBeCloseTo(1, 10);
  });
});
