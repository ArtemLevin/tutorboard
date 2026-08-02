import { describe, expect, it } from "vitest";

import {
  convertHandwrittenFunctionCandidate,
  handwrittenFunctionInterpretationLimits,
  type MathInkRecognitionCandidate,
} from "../../../../src/modules/handwritten-function/public";

function convert(
  expression: string,
  format: MathInkRecognitionCandidate["format"],
) {
  return convertHandwrittenFunctionCandidate({ expression, format });
}

describe("handwritten function expression conversion", () => {
  it("cleans native wrappers, Unicode operators and superscripts", () => {
    expect(convert("y = 2x⁴ − 3π", "plot-expression")).toEqual({
      expression: "2x^(4) - 3pi",
      ok: true,
      resolvedFormat: "plot-expression",
    });
    expect(convert("f(x)=|x−1|", "plot-expression")).toEqual({
      expression: "abs(x-1)",
      ok: true,
      resolvedFormat: "plot-expression",
    });
  });

  it("converts nested LaTeX fractions, roots, powers and functions", () => {
    expect(
      convert(
        String.raw`f(x)=\frac{x+1}{\sqrt{x^{2}+4}}+\sin{x}+\pi`,
        "latex",
      ),
    ).toEqual({
      expression: "((x+1)/(sqrt(x^(2)+4)))+sin(x)+pi",
      ok: true,
      resolvedFormat: "latex",
    });
    expect(
      convert(String.raw`y=\operatorname{max}{x,\mathrm{e}}`, "latex"),
    ).toEqual({
      expression: "max(x,e)",
      ok: true,
      resolvedFormat: "latex",
    });
  });

  it.each([
    [String.raw`\frac{x}{`, "handwriting.interpretation.latex-malformed"],
    [String.raw`x_{1}`, "handwriting.interpretation.latex-subscript"],
    [
      String.raw`\unknown{x}`,
      "handwriting.interpretation.latex-unsupported-command",
    ],
    ["x=2", "handwriting.interpretation.unsupported-relation"],
    ["y=x=2", "handwriting.interpretation.unsupported-relation"],
  ] as const)("rejects unsupported input %s", (expression, code) => {
    const result = convert(
      expression,
      expression.includes("\\") ? "latex" : "plot-expression",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostic.code).toBe(code);
  });

  it("extracts preferred mathematical text from bounded JIIX", () => {
    const jiix = JSON.stringify({
      expressions: [{ label: "x^2+1", type: "function" }],
      latex: String.raw`y=\frac{x}{2}`,
      type: "math",
    });
    expect(convert(jiix, "jiix")).toEqual({
      expression: "((x)/(2))",
      ok: true,
      resolvedFormat: "latex",
    });
  });

  it("reports malformed and unsupported JIIX", () => {
    const malformed = convert("{", "jiix");
    expect(malformed.ok).toBe(false);
    if (!malformed.ok) {
      expect(malformed.diagnostic.code).toBe(
        "handwriting.interpretation.jiix-parse",
      );
    }

    const unsupported = convert(JSON.stringify({ type: "math" }), "jiix");
    expect(unsupported.ok).toBe(false);
    if (!unsupported.ok) {
      expect(unsupported.diagnostic.code).toBe(
        "handwriting.interpretation.jiix-unsupported",
      );
    }
  });

  it("enforces source and JIIX depth budgets", () => {
    const oversized = convert(
      "x".repeat(
        handwrittenFunctionInterpretationLimits.maximumCandidateSourceLength +
          1,
      ),
      "plot-expression",
    );
    expect(oversized.ok).toBe(false);
    if (!oversized.ok) {
      expect(oversized.diagnostic.code).toBe(
        "handwriting.interpretation.source-too-long",
      );
    }

    let nested: unknown = { latex: "x" };
    for (
      let depth = 0;
      depth <= handwrittenFunctionInterpretationLimits.maximumJiixDepth;
      depth += 1
    ) {
      nested = { child: nested };
    }
    const deep = convert(JSON.stringify(nested), "jiix");
    expect(deep.ok).toBe(false);
    if (!deep.ok) {
      expect(deep.diagnostic.code).toBe(
        "handwriting.interpretation.jiix-depth-limit",
      );
    }
  });
});
