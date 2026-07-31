import { describe, expect, it } from "vitest";

import {
  compilePlotExpression,
  evaluatePlotExpression,
  maximumExpressionAstDepth,
  normalizePlotExpression,
} from "../../../../src/core/public";

describe("coordinate plot expression public API", () => {
  it("is exported through the core boundary", () => {
    const compiled = compilePlotExpression("x^2", {
      context: "explicit-function",
      parameterNames: [],
    });

    expect(normalizePlotExpression("x²").source).toBe("x^2");
    expect(maximumExpressionAstDepth).toBe(64);
    expect(compiled.ok).toBe(true);
    if (compiled.ok) {
      expect(evaluatePlotExpression(compiled.expression, { x: 3 })).toEqual({
        kind: "value",
        value: 9,
      });
    }
  });
});
