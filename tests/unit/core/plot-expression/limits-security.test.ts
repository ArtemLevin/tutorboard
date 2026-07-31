import { describe, expect, it } from "vitest";

import {
  compilePlotExpression,
  maximumExpressionLength,
} from "../../../../src/core/plot-expression/public";

const compile = (source: string) =>
  compilePlotExpression(source, {
    context: "explicit-function",
    parameterNames: [],
  });

describe("coordinate plot expression safety limits", () => {
  it("rejects overlong expressions", () => {
    const result = compile("1".repeat(maximumExpressionLength + 1));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe(
        "expression.expression-too-long",
      );
    }
  });

  it("rejects excessive AST depth", () => {
    const result = compile(`${"(".repeat(70)}1${")".repeat(70)}`);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe("expression.ast-too-deep");
    }
  });

  it("rejects deep left-associative AST chains", () => {
    const result = compile(Array.from({ length: 70 }, () => "1").join("+"));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe("expression.ast-too-deep");
    }
  });

  it("rejects excessive token count", () => {
    const result = compile(Array.from({ length: 600 }, () => "1").join("+"));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]?.code).toBe("expression.too-many-tokens");
    }
  });

  it.each([
    "window.alert(1)",
    "globalThis",
    "constructor",
    "__proto__",
    "Math.sin(x)",
    "x = 10",
    "x;alert(1)",
    'Function("return 1")',
    'eval("1+1")',
    "[1,2,3]",
    "{x:1}",
    "a?.b",
    'a["b"]',
  ])("rejects unsafe input %s", (source) => {
    const result = compile(source);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it("returns deterministic diagnostics", () => {
    const first = compile("sqrt(");
    const second = compile("sqrt(");

    expect(first).toEqual(second);
  });
});
