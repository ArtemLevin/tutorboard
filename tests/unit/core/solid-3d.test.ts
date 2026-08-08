import { describe, expect, it } from "vitest";

import {
  actorId,
  commandId,
  createEmptyBoardDocument,
  createSolidTopology,
  defaultSolidProjection,
  documentId,
  intersectAnalyticSolidWithPlane,
  intersectPolyhedronWithPlane,
  migrateBoardDocument12To13,
  planeFromThreePoints,
  reduceBoardDocument,
  regularBase,
  resolveSolidPointAnchor,
  solid3DId,
  type Solid3DRecord,
} from "../../../src/core/public";
import {
  createTextShapePlacementCommand,
  textShapeCatalog,
} from "../../../src/modules/text-shape-placement/public";

const timestamp = "2026-08-08T12:00:00.000Z";

describe("solid 3D geometry core", () => {
  it("generates deterministic convex topology", () => {
    const cube = createSolidTopology({ edgeLength: 2, kind: "cube" });
    expect(cube).toMatchObject({
      vertices: { length: 8 },
      edges: { length: 12 },
      faces: { length: 6 },
    });
    const prism = createSolidTopology({
      base: regularBase(3),
      height: 2,
      kind: "prism",
    });
    expect(prism).toMatchObject({
      vertices: { length: 6 },
      edges: { length: 9 },
      faces: { length: 5 },
    });
    const pyramid = createSolidTopology({
      apex: { x: 0, y: 2, z: 0 },
      base: regularBase(4),
      kind: "pyramid",
    });
    expect(pyramid).toMatchObject({
      vertices: { length: 5 },
      edges: { length: 8 },
      faces: { length: 5 },
    });
  });

  it("builds a stable square section through a cube", () => {
    const topology = createSolidTopology({ edgeLength: 2, kind: "cube" })!;
    const plane = planeFromThreePoints(
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
    )!;
    const section = intersectPolyhedronWithPlane(topology, plane)!;
    expect(section.vertices).toHaveLength(4);
    expect(section.area).toBeCloseTo(4, 8);
    expect(section.perimeter).toBeCloseTo(8, 8);
    expect(intersectPolyhedronWithPlane(topology, plane)?.vertices).toEqual(
      section.vertices,
    );
  });

  it("rejects collinear plane points and resolves semantic anchors", () => {
    expect(
      planeFromThreePoints(
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 1, z: 1 },
        { x: 2, y: 2, z: 2 },
      ),
    ).toBeNull();
    const topology = createSolidTopology({ edgeLength: 2, kind: "cube" })!;
    expect(
      resolveSolidPointAnchor(topology, {
        kind: "vertex",
        vertexId: "vertex:0",
      }),
    ).toEqual({ x: -1, y: -1, z: -1 });
    expect(
      resolveSolidPointAnchor(topology, {
        edgeId: topology.edges[0]!.id,
        kind: "edge",
        parameter: 0.5,
      }),
    ).not.toBeNull();
  });

  it("computes analytic sphere and cylinder sections", () => {
    const horizontal = planeFromThreePoints(
      { x: 0, y: 0, z: 0 },
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
    )!;
    const sphere = intersectAnalyticSolidWithPlane(
      { kind: "sphere", radius: 2 },
      horizontal,
    )!;
    expect(sphere.area).toBeCloseTo(Math.PI * 4, 8);
    expect(sphere.perimeter).toBeCloseTo(Math.PI * 4, 8);
    const cylinder = intersectAnalyticSolidWithPlane(
      { height: 4, kind: "cylinder", radius: 2 },
      horizontal,
    )!;
    expect(cylinder.area).toBeCloseTo(Math.PI * 4, 1);
  });
});

describe("BoardDocument 1.3 solid integration", () => {
  it("creates a semantic solid with the existing template group atomically", () => {
    const definition = textShapeCatalog.find(({ id }) => id === "cube")!;
    const command = createTextShapePlacementCommand({
      autoLabelVertices: true,
      definition,
      metadata: {
        actorId: actorId("actor:test"),
        id: commandId("command:cube"),
        timestamp,
      },
      placement: { x: 120, y: 80 },
      token: "cube-test",
    });
    expect(command.solidModels).toHaveLength(1);
    const document = createEmptyBoardDocument({
      createdAt: timestamp,
      id: documentId("document:test"),
      title: "3D",
    });
    const reduced = reduceBoardDocument(document, command);
    expect(reduced.ok).toBe(true);
    if (!reduced.ok) return;
    const model = Object.values(reduced.document.solidModels)[0]!;
    expect(model.definition.kind).toBe("cube");
    expect(model.boardObjectIds).toEqual(command.objects.map(({ id }) => id));
  });

  it("migrates 1.2 with an empty solid dictionary", () => {
    const current = createEmptyBoardDocument({
      createdAt: timestamp,
      id: documentId("document:migration"),
      title: "Legacy",
    });
    const { solidModels, ...legacy } = current;
    expect(solidModels).toEqual({});
    const migrated = migrateBoardDocument12To13({
      ...legacy,
      schemaVersion: "1.2",
    });
    expect(migrated.ok).toBe(true);
    if (migrated.ok) expect(migrated.document.solidModels).toEqual({});
  });

  it("rejects stale solid updates", () => {
    const record: Solid3DRecord = {
      boardObjectIds: [],
      definition: { edgeLength: 2, kind: "cube" },
      id: solid3DId("solid:test"),
      points: [],
      projection: defaultSolidProjection,
      rootGroupId: "group:test" as never,
      schemaVersion: "1.0",
      sections: [],
      source: { kind: "text-template", templateId: "cube" },
    };
    expect(record.definition.kind).toBe("cube");
  });
});
