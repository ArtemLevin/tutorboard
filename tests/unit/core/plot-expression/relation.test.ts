import { describe, expect, it } from "vitest";

import {
  compilePlotExpression,
  parsePlotRelation,
} from "../../../../src/core/public";

describe("plot relation expressions", () => {
  it("parses equations and Unicode inequalities entered as complete expressions", () => {
    expect(parsePlotRelation("x^2 + y^2 = 25")).toMatchObject({
      leftSource: "x^2 + y^2",
      ok: true,
      operator: "=",
      rightSource: "25",
    });
    expect(parsePlotRelation("y ≥ x^2")).toMatchObject({
      leftSource: "y",
      ok: true,
      operator: ">=",
      rightSource: "x^2",
    });
  });

  it("allows both coordinate variables on either side", () => {
    expect(
      compilePlotExpression("x^2+y^2", {
        context: "relation-side",
        parameterNames: [],
      }).ok,
    ).toBe(true);
  });

  it("rejects incomplete and chained relations", () => {
    expect(parsePlotRelation("x^2+y^2").ok).toBe(false);
    expect(parsePlotRelation("0<x<2").ok).toBe(false);
  });
});
