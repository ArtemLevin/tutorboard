import { describe, expect, it } from "vitest";

import { solidDefinitionFromTemplate } from "../../../../src/core/public";

describe("solidDefinitionFromTemplate", () => {
  it("keeps the sphere as a semantic analytic solid", () => {
    expect(solidDefinitionFromTemplate("sphere")).toEqual({
      kind: "sphere",
      radius: 1.4,
    });
  });

  it("does not misrepresent a hemisphere as a full sphere", () => {
    expect(solidDefinitionFromTemplate("hemisphere")).toBeNull();
  });

  it("keeps octahedron static until the semantic kernel supports it", () => {
    expect(solidDefinitionFromTemplate("octahedron")).toBeNull();
  });
});
