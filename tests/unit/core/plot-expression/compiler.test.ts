import { describe, expect, it } from "vitest";

import {
  compilePlotExpression,
  normalizePlotExpression,
} from "../../../../src/core/plot-expression/public";

describe("coordinate plot expression compiler", () => {
  it("normalizes supported school notation", () => {
    expect(normalizePlotExpression("x² + π − 2×x ÷ 3").source).toBe(
      "x^2 + pi - 2*x / 3",
    );
    expect(normalizePlotExpression("x³").source).toBe("x^3");
  });

  it("accepts explicit and parametric expression contexts", () => {
    expect(
      compilePlotExpression("a*x^2 + b", {
        context: "explicit-function",
        parameterNames: ["a", "b"],
      }).ok,
    ).toBe(true);
    expect(
      compilePlotExpression("3*cos(t)", {
        context: "parametric-x",
        parameterNames: [],
      }).ok,
    ).toBe(true);
    expect(
      compilePlotExpression("2*pi", {
        context: "parametric-range",
        parameterNames: [],
      }).ok,
    ).toBe(true);
  });

  it("supports implicit multiplication", () => {
    for (const source of [
      "2x",
      "3sin(x)",
      "2(x+1)",
      "(x+1)(x-1)",
      "a x^2",
      "pi x",
    ]) {
      expect(
        compilePlotExpression(source, {
          context: "explicit-function",
          parameterNames: ["a"],
        }).ok,
        source,
      ).toBe(true);
    }
  });

  it("enforces context-specific variables", () => {
    const explicit = compilePlotExpression("t^2", {
      context: "explicit-function",
      parameterNames: [],
    });
    const domain = compilePlotExpression("x+1", {
      context: "explicit-domain",
      parameterNames: [],
    });
    const range = compilePlotExpression("x", {
      context: "parametric-range",
      parameterNames: [],
    });

    expect(explicit.ok).toBe(false);
    expect(domain.ok).toBe(false);
    expect(range.ok).toBe(false);
    if (!explicit.ok) {
      expect(explicit.diagnostics[0]?.code).toBe(
        "expression.variable-not-allowed",
      );
    }
    if (!domain.ok) {
      expect(domain.diagnostics[0]?.code).toBe(
        "expression.variable-not-allowed",
      );
    }
    if (!range.ok) {
      expect(range.diagnostics[0]?.code).toBe(
        "expression.variable-not-allowed",
      );
    }
  });

  it("validates identifiers and function arity", () => {
    const unknown = compilePlotExpression("q+x", {
      context: "explicit-function",
      parameterNames: [],
    });
    const missingParentheses = compilePlotExpression("sin x", {
      context: "explicit-function",
      parameterNames: [],
    });
    const unaryArity = compilePlotExpression("sqrt(1,2)", {
      context: "explicit-function",
      parameterNames: [],
    });
    const variadicArity = compilePlotExpression("min(1)", {
      context: "explicit-function",
      parameterNames: [],
    });

    expect(unknown.ok).toBe(false);
    expect(missingParentheses.ok).toBe(false);
    expect(unaryArity.ok).toBe(false);
    expect(variadicArity.ok).toBe(false);
    if (!unknown.ok) {
      expect(unknown.diagnostics[0]?.code).toBe(
        "expression.unknown-identifier",
      );
    }
    if (!missingParentheses.ok) {
      expect(missingParentheses.diagnostics[0]?.code).toBe(
        "expression.function-requires-parentheses",
      );
    }
    if (!unaryArity.ok) {
      expect(unaryArity.diagnostics[0]?.code).toBe(
        "expression.invalid-function-arity",
      );
    }
    if (!variadicArity.ok) {
      expect(variadicArity.diagnostics[0]?.code).toBe(
        "expression.invalid-function-arity",
      );
    }
  });

  it("rejects invalid parameter environments", () => {
    const reserved = compilePlotExpression("1", {
      context: "explicit-domain",
      parameterNames: ["sin"],
    });
    const invalid = compilePlotExpression("1", {
      context: "explicit-domain",
      parameterNames: ["1a"],
    });
    const leadingUnderscore = compilePlotExpression("1", {
      context: "explicit-domain",
      parameterNames: ["_a"],
    });
    const duplicate = compilePlotExpression("1", {
      context: "explicit-domain",
      parameterNames: ["a", "a"],
    });

    expect(reserved.ok).toBe(false);
    expect(invalid.ok).toBe(false);
    expect(leadingUnderscore.ok).toBe(false);
    expect(duplicate.ok).toBe(false);
    if (!reserved.ok) {
      expect(reserved.diagnostics[0]?.code).toBe(
        "expression.reserved-parameter-name",
      );
    }
    if (!invalid.ok) {
      expect(invalid.diagnostics[0]?.code).toBe(
        "expression.invalid-parameter-name",
      );
    }
    if (!duplicate.ok) {
      expect(duplicate.diagnostics[0]?.code).toBe(
        "expression.duplicate-parameter-name",
      );
    }
  });

  it("returns source ranges for syntax errors", () => {
    const result = compilePlotExpression("sin(x", {
      context: "explicit-function",
      parameterNames: [],
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.diagnostics[0]).toMatchObject({
        code: "expression.expected-closing-parenthesis",
        severity: "error",
      });
      expect(result.diagnostics[0]!.start).toBeGreaterThanOrEqual(0);
      expect(result.diagnostics[0]!.end).toBeGreaterThanOrEqual(
        result.diagnostics[0]!.start,
      );
    }
  });
});
