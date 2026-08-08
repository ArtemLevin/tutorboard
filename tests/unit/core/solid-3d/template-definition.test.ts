import { describe, expect, it } from "vitest";

import { solidDefinitionFromTemplate } from "../../../../src/core/public";

describe("solidDefinitionFromTemplate", () => {
  it("keeps the sphere as a semantic analytic solid", () => {
    expect(solidDefinitionFromTemplate("sphere")).toEqual({
      kind: "sphere",
      radius: 1.4,
    });
  });

  it("maps hemisphere to its own semantic analytic definition", () => {
    expect(solidDefinitionFromTemplate("hemisphere")).toEqual({
      kind: "hemisphere",
      radius: 1.4,
    });
  });

  it("maps octahedron to a semantic polyhedron", () => {
    expect(solidDefinitionFromTemplate("octahedron")).toEqual({
      edgeLength: 2.6,
      kind: "octahedron",
    });
  });

  it("supports future regular-polyhedron and truncated-pyramid template ids", () => {
    expect(solidDefinitionFromTemplate("dodecahedron")).toMatchObject({
      kind: "regular-polyhedron",
      variant: "dodecahedron",
    });
    expect(solidDefinitionFromTemplate("icosahedron")).toMatchObject({
      kind: "regular-polyhedron",
      variant: "icosahedron",
    });
    expect(solidDefinitionFromTemplate("truncated-pyramid-5")).toMatchObject({
      bottomBase: { length: 5 },
      kind: "truncated-pyramid",
      topBase: { length: 5 },
    });
  });
});
