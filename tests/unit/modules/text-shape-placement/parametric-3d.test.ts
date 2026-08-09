import { describe, expect, it } from "vitest";

import {
  resolveTextShape,
  suggestTextShapes,
} from "../../../../src/modules/text-shape-placement/public";

describe("parametric 3D text placement", () => {
  it("resolves arbitrary prism and pyramid side counts", () => {
    expect(resolveTextShape("семиугольная призма")).toMatchObject({
      id: "prism-7",
      template: { kind: "prism", sides: 7 },
    });
    expect(resolveTextShape("призма 7")).toMatchObject({ id: "prism-7" });
    expect(resolveTextShape("пирамида с 11 угольным основанием")).toMatchObject(
      {
        id: "pyramid-11",
        template: { kind: "pyramid", sides: 11 },
      },
    );
  });

  it("resolves truncated pyramids and Platonic solids", () => {
    expect(resolveTextShape("усечённая пятиугольная пирамида")).toMatchObject({
      id: "truncated-pyramid-5",
    });
    expect(resolveTextShape("додекаэдр")?.id).toBe("dodecahedron");
    expect(resolveTextShape("правильный икосаэдр")?.id).toBe("icosahedron");
  });

  it("keeps the 3..32 domain bound", () => {
    expect(resolveTextShape("призма 2")).toBeUndefined();
    expect(resolveTextShape("пирамида 33")).toBeUndefined();
    expect(suggestTextShapes("призма 27")[0]?.id).toBe("prism-27");
  });
});
