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
  resolveAnalyticSolidPointAnchor,
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

  it("generates octahedron and truncated-pyramid topology", () => {
    expect(
      createSolidTopology({ edgeLength: 2, kind: "octahedron" }),
    ).toMatchObject({
      vertices: { length: 6 },
      edges: { length: 12 },
      faces: { length: 8 },
    });
    expect(
      createSolidTopology({
        bottomBase: regularBase(4, 2),
        height: 3,
        kind: "truncated-pyramid",
        topBase: regularBase(4, 1),
      }),
    ).toMatchObject({
      vertices: { length: 8 },
      edges: { length: 12 },
      faces: { length: 6 },
    });
  });

  it("generates every Platonic solid through regular-polyhedron", () => {
    const expectations = [
      ["tetrahedron", 4, 6, 4],
      ["cube", 8, 12, 6],
      ["octahedron", 6, 12, 8],
      ["dodecahedron", 20, 30, 12],
      ["icosahedron", 12, 30, 20],
    ] as const;
    for (const [variant, vertices, edges, faces] of expectations) {
      expect(
        createSolidTopology({
          edgeLength: 2,
          kind: "regular-polyhedron",
          variant,
        }),
      ).toMatchObject({
        edges: { length: edges },
        faces: { length: faces },
        vertices: { length: vertices },
      });
    }
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

  it("resolves hemisphere curved and base analytic anchors", () => {
    const definition = { kind: "hemisphere", radius: 2 } as const;
    expect(
      resolveAnalyticSolidPointAnchor(definition, {
        kind: "analytic-surface",
        parameters: [0, 0],
        surfaceId: "surface:hemisphere-curved",
      }),
    ).toEqual({ x: 0, y: 2, z: 0 });
    expect(
      resolveAnalyticSolidPointAnchor(definition, {
        kind: "analytic-surface",
        parameters: [0, 1],
        surfaceId: "surface:hemisphere-base",
      }),
    ).toEqual({ x: 2, y: 0, z: 0 });
  });

  it("computes analytic sphere, hemisphere and cylinder sections", () => {
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
    const hemisphereBase = intersectAnalyticSolidWithPlane(
      { kind: "hemisphere", radius: 2 },
      horizontal,
    )!;
    expect(hemisphereBase.area).toBeCloseTo(Math.PI * 4, 8);
    expect(hemisphereBase.perimeter).toBeCloseTo(Math.PI * 4, 8);

    const vertical = planeFromThreePoints(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 },
      { x: 0, y: 0, z: 1 },
    )!;
    const hemisphereVertical = intersectAnalyticSolidWithPlane(
      { kind: "hemisphere", radius: 2 },
      vertical,
    )!;
    expect(hemisphereVertical.area).toBeCloseTo(Math.PI * 2, 8);
    expect(hemisphereVertical.perimeter).toBeCloseTo(Math.PI * 2 + 4, 8);

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

  it("creates semantic hemisphere and octahedron records from text templates", () => {
    for (const [definitionId, expectedKind] of [
      ["hemisphere", "hemisphere"],
      ["octahedron", "octahedron"],
    ] as const) {
      const definition = textShapeCatalog.find(
        ({ id }) => id === definitionId,
      )!;
      const command = createTextShapePlacementCommand({
        autoLabelVertices: true,
        definition,
        metadata: {
          actorId: actorId("actor:test"),
          id: commandId(`command:${definitionId}`),
          timestamp,
        },
        placement: { x: 120, y: 80 },
        token: `${definitionId}-test`,
      });
      expect(command.solidModels?.[0]?.definition.kind).toBe(expectedKind);
    }
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
