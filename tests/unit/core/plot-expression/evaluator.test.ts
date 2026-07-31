import { describe, expect, it } from "vitest";

import {
  compilePlotExpression,
  evaluatePlotExpression,
  type PlotExpressionContext,
} from "../../../../src/core/plot-expression/public";

function evaluate(
  source: string,
  bindings: Readonly<Record<string, number>> = {},
  options: {
    readonly context?: PlotExpressionContext;
    readonly parameterNames?: readonly string[];
  } = {},
) {
  const compiled = compilePlotExpression(source, {
    context: options.context ?? "explicit-function",
    parameterNames: options.parameterNames ?? [],
  });
  expect(compiled.ok).toBe(true);
  if (!compiled.ok) throw new Error(compiled.diagnostics[0]?.message);
  return evaluatePlotExpression(compiled.expression, bindings);
}

describe("coordinate plot expression evaluator", () => {
  it.each([
    ["2 + 3 * 4", 14],
    ["(2 + 3) * 4", 20],
    ["2^3^2", 512],
    ["-x^2", -9],
    ["(-x)^2", 9],
    ["2x + 3", 9],
    ["(x+1)(x-1)", 8],
  ] as const)(
    "evaluates %s with deterministic precedence",
    (source, expected) => {
      const bindings = source.includes("x") ? { x: 3 } : {};
      expect(evaluate(source, bindings)).toEqual({
        kind: "value",
        value: expected,
      });
    },
  );

  it("evaluates constants and supported functions", () => {
    const result = evaluate(
      "sin(pi/2)+cos(0)+sqrt(9)+abs(-4)+ln(e)+log(100)+min(3,1,2)+max(3,1,2)",
    );

    expect(result.kind).toBe("value");
    if (result.kind === "value") expect(result.value).toBeCloseTo(16, 12);
  });

  it("evaluates explicit and parametric bindings", () => {
    expect(
      evaluate(
        "a*x^2+b",
        { a: 2, b: 1, x: 3 },
        {
          parameterNames: ["a", "b"],
        },
      ),
    ).toEqual({ kind: "value", value: 19 });
    expect(
      evaluate(
        "r*cos(t)",
        { r: 3, t: 0 },
        {
          context: "parametric-x",
          parameterNames: ["r"],
        },
      ),
    ).toEqual({ kind: "value", value: 3 });
  });

  it("requires only bindings referenced by the expression", () => {
    expect(
      evaluate(
        "a*x",
        { a: 2, x: 3 },
        {
          parameterNames: ["a", "unused"],
        },
      ),
    ).toEqual({ kind: "value", value: 6 });
  });

  it("reports missing and non-finite bindings without throwing", () => {
    expect(evaluate("a*x", { x: 2 }, { parameterNames: ["a"] })).toEqual({
      kind: "missing-bindings",
      names: ["a"],
    });
    expect(evaluate("x", { x: Number.NaN })).toEqual({
      kind: "undefined",
      reason: "non-finite",
    });
  });

  it.each([
    ["sqrt(-1)", "domain"],
    ["ln(0)", "domain"],
    ["acos(2)", "domain"],
    ["1/0", "division-by-zero"],
    ["exp(10000)", "non-finite"],
  ] as const)("classifies undefined result for %s", (source, reason) => {
    expect(evaluate(source)).toEqual({ kind: "undefined", reason });
  });
});
