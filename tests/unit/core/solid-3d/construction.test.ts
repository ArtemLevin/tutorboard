import { describe, expect, it } from "vitest";

import {
  constructionSideCount,
  defaultSolidProjection,
  definitionForSolidConstruction,
  replaceSolidConstructionBase,
  replaceSolidConstructionDefinition,
  validateSolidConstructionBase,
  type Solid3DRecord,
} from "../../../../src/core/public";

const record = {
  boardObjectIds: [],
  definition: definitionForSolidConstruction("prism", 4),
  id: "solid:construction",
  points: [
    {
      anchor: { kind: "vertex", vertexId: "vertex:bottom:0" },
      id: "solid-point:construction",
      label: "A",
      position: { x: 0, y: 0, z: 0 },
    },
  ],
  projection: defaultSolidProjection,
  rootGroupId: "group:construction",
  schemaVersion: "1.0",
  sections: [],
  source: { kind: "text-template", templateId: "prism-4" },
} as Solid3DRecord;

describe("solid construction studio domain", () => {
  it("creates regular prism, pyramid and truncated-pyramid definitions up to 32 sides", () => {
    expect(
      constructionSideCount(definitionForSolidConstruction("prism", 7)),
    ).toBe(7);
    expect(
      constructionSideCount(definitionForSolidConstruction("pyramid", 32)),
    ).toBe(32);
    expect(
      constructionSideCount(
        definitionForSolidConstruction("truncated-pyramid", 5),
      ),
    ).toBe(5);
  });

  it("exposes dodecahedron and icosahedron as native semantic definitions", () => {
    expect(definitionForSolidConstruction("dodecahedron")).toMatchObject({
      kind: "regular-polyhedron",
      variant: "dodecahedron",
    });
    expect(definitionForSolidConstruction("icosahedron")).toMatchObject({
      kind: "regular-polyhedron",
      variant: "icosahedron",
    });
  });

  it("validates arbitrary bases and rejects crossing polygons", () => {
    expect(
      validateSolidConstructionBase([
        { x: -1, y: -1 },
        { x: 1, y: -1 },
        { x: 1, y: 1 },
        { x: -1, y: 1 },
      ]),
    ).toEqual({ code: "base.ok", valid: true });
    expect(
      validateSolidConstructionBase([
        { x: -1, y: -1 },
        { x: 1, y: 1 },
        { x: 1, y: -1 },
        { x: -1, y: 1 },
      ]),
    ).toEqual({ code: "base.zero-area", valid: false });
    expect(
      validateSolidConstructionBase([
        { x: 0, y: 0 },
        { x: 2, y: 2 },
        { x: 0, y: 2 },
        { x: 2, y: 0.5 },
      ]).valid,
    ).toBe(false);
  });

  it("clears dependent semantic points and sections when topology changes", () => {
    const replacement = replaceSolidConstructionDefinition(
      record,
      definitionForSolidConstruction("pyramid", 6),
    );
    expect(replacement.points).toEqual([]);
    expect(replacement.sections).toEqual([]);
    expect(replacement.definition.kind).toBe("pyramid");
  });

  it("applies a valid custom prism base", () => {
    const replacement = replaceSolidConstructionBase(record, [
      { x: -2, y: -1 },
      { x: 1, y: -1 },
      { x: 1.5, y: 0.5 },
      { x: 0, y: 2 },
      { x: -1.5, y: 1 },
    ]);
    expect(replacement?.definition.kind).toBe("prism");
    if (replacement?.definition.kind !== "prism") return;
    expect(replacement.definition.base).toHaveLength(5);
  });
});
