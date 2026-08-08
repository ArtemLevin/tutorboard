import { describe, expect, it } from "vitest";

import {
  canonicalizeAnalyticSurfaceAnchor,
  defaultSolidProjection,
  reprojectSolid3DRecord,
  resolveAnalyticSolidPointAnchor,
  solid3DId,
  solidPointId,
  type Solid3DDefinition,
  type Solid3DRecord,
  type SolidAnalyticSurfaceId,
  type Vec3,
} from "../../../../src/core/public";

interface Case {
  readonly definition: Solid3DDefinition;
  readonly point: Vec3;
  readonly surfaceId: SolidAnalyticSurfaceId;
}

const cases: readonly Case[] = [
  {
    definition: { kind: "sphere", radius: 2 },
    point: { x: 1.7, y: 0.4, z: 0.6 },
    surfaceId: "surface:sphere",
  },
  {
    definition: { kind: "hemisphere", radius: 2 },
    point: { x: 1.2, y: 1.4, z: 0.5 },
    surfaceId: "surface:hemisphere-curved",
  },
  {
    definition: { kind: "hemisphere", radius: 2 },
    point: { x: 1.1, y: 0.03, z: 0.7 },
    surfaceId: "surface:hemisphere-base",
  },
  {
    definition: { height: 4, kind: "cylinder", radius: 2 },
    point: { x: 1.8, y: 0.8, z: 0.4 },
    surfaceId: "surface:cylinder-side",
  },
  {
    definition: { height: 4, kind: "cylinder", radius: 2 },
    point: { x: 0.8, y: -2.02, z: 0.5 },
    surfaceId: "surface:cylinder-bottom",
  },
  {
    definition: { height: 4, kind: "cylinder", radius: 2 },
    point: { x: 0.8, y: 2.02, z: 0.5 },
    surfaceId: "surface:cylinder-top",
  },
  {
    definition: { height: 4, kind: "cone", radius: 2 },
    point: { x: 0.9, y: 0.2, z: 0.4 },
    surfaceId: "surface:cone-side",
  },
  {
    definition: { height: 4, kind: "cone", radius: 2 },
    point: { x: 0.7, y: -2.01, z: 0.6 },
    surfaceId: "surface:cone-base",
  },
  {
    definition: {
      bottomRadius: 2,
      height: 4,
      kind: "truncated-cone",
      topRadius: 1,
    },
    point: { x: 1.2, y: 0.5, z: 0.3 },
    surfaceId: "surface:truncated-cone-side",
  },
  {
    definition: {
      bottomRadius: 2,
      height: 4,
      kind: "truncated-cone",
      topRadius: 1,
    },
    point: { x: 0.9, y: -2.01, z: 0.2 },
    surfaceId: "surface:truncated-cone-bottom",
  },
  {
    definition: {
      bottomRadius: 2,
      height: 4,
      kind: "truncated-cone",
      topRadius: 1,
    },
    point: { x: 0.6, y: 2.01, z: 0.2 },
    surfaceId: "surface:truncated-cone-top",
  },
];

function expectVecClose(actual: Vec3, expected: Vec3): void {
  expect(actual.x).toBeCloseTo(expected.x, 8);
  expect(actual.y).toBeCloseTo(expected.y, 8);
  expect(actual.z).toBeCloseTo(expected.z, 8);
}

describe("analytic surface anchor canonicalization", () => {
  it("round-trips every analytic surface through canonical parameters", () => {
    for (const { definition, point, surfaceId } of cases) {
      const placement = canonicalizeAnalyticSurfaceAnchor(
        definition,
        point,
        surfaceId,
      );
      expect(placement, surfaceId).not.toBeNull();
      if (placement === null) continue;
      expect(placement.anchor.surfaceId).toBe(surfaceId);
      expect(placement.anchor.surfaceId).not.toBe("surface:0");
      expect(placement.anchor.parameters).toHaveLength(2);
      const resolved = resolveAnalyticSolidPointAnchor(
        definition,
        placement.anchor,
      );
      expect(resolved).not.toBeNull();
      if (resolved !== null) expectVecClose(resolved, placement.position);
    }
  });

  it("snaps hit coordinates back to exact analytic surfaces", () => {
    const sphere = canonicalizeAnalyticSurfaceAnchor(
      { kind: "sphere", radius: 2 },
      { x: 1.8, y: 0.5, z: 0.3 },
      "surface:sphere",
    )!;
    expect(
      Math.hypot(sphere.position.x, sphere.position.y, sphere.position.z),
    ).toBeCloseTo(2, 10);

    const cylinder = canonicalizeAnalyticSurfaceAnchor(
      { height: 4, kind: "cylinder", radius: 2 },
      { x: 1.7, y: 0.75, z: 0.2 },
      "surface:cylinder-side",
    )!;
    expect(Math.hypot(cylinder.position.x, cylinder.position.z)).toBeCloseTo(
      2,
      10,
    );

    const base = canonicalizeAnalyticSurfaceAnchor(
      { height: 4, kind: "cone", radius: 2 },
      { x: 0.5, y: -1.97, z: 0.3 },
      "surface:cone-base",
    )!;
    expect(base.position.y).toBeCloseTo(-2, 10);
  });

  it("preserves semantic location when analytic dimensions change", () => {
    const record: Solid3DRecord = {
      boardObjectIds: [],
      definition: { height: 4, kind: "cylinder", radius: 2 },
      id: solid3DId("solid:resize"),
      points: [
        {
          anchor: {
            kind: "analytic-surface",
            parameters: [Math.PI / 2, 0.75],
            surfaceId: "surface:cylinder-side",
          },
          id: solidPointId("solid-point:resize"),
          label: "A",
          position: { x: 0, y: 1, z: 2 },
        },
      ],
      projection: defaultSolidProjection,
      rootGroupId: "group:resize" as never,
      schemaVersion: "1.0",
      sections: [],
      source: { kind: "text-template", templateId: "cylinder" },
    };
    const resized = reprojectSolid3DRecord(record, {
      height: 8,
      kind: "cylinder",
      radius: 4,
    });
    expect(resized.points[0]!.anchor).toEqual(record.points[0]!.anchor);
    expectVecClose(resized.points[0]!.position, { x: 0, y: 2, z: 4 });
  });

  it("keeps legacy surface:0 coordinates as a compatibility fallback", () => {
    const record: Solid3DRecord = {
      boardObjectIds: [],
      definition: { kind: "sphere", radius: 2 },
      id: solid3DId("solid:legacy"),
      points: [
        {
          anchor: {
            kind: "analytic-surface",
            parameters: [1, 2, 3],
            surfaceId: "surface:0",
          },
          id: solidPointId("solid-point:legacy"),
          label: "A",
          position: { x: 1, y: 2, z: 3 },
        },
      ],
      projection: defaultSolidProjection,
      rootGroupId: "group:legacy" as never,
      schemaVersion: "1.0",
      sections: [],
      source: { kind: "text-template", templateId: "sphere" },
    };
    const resized = reprojectSolid3DRecord(record, {
      kind: "sphere",
      radius: 4,
    });
    expect(resized.points[0]!.position).toEqual({ x: 1, y: 2, z: 3 });
  });
});
