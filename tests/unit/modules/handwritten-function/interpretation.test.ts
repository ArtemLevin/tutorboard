import { describe, expect, it } from "vitest";

import {
  handwrittenFunctionInterpretationLimits,
  handwrittenFunctionInterpretationSchemaVersion,
  interpretMathInkRecognitionResult,
  mathInkRecognitionResultSchemaVersion,
  type MathInkRecognitionCandidate,
  type MathInkRecognitionResult,
} from "../../../../src/modules/handwritten-function/public";

function recognition(
  candidates: readonly MathInkRecognitionCandidate[],
  status: MathInkRecognitionResult["status"] = "recognized",
): MathInkRecognitionResult {
  return {
    candidates,
    diagnostics: [],
    recognizerId: "test-recognizer",
    recognizerVersion: "1",
    schemaVersion: mathInkRecognitionResultSchemaVersion,
    status,
  };
}

describe("handwritten function interpretation", () => {
  it("discovers parameters in first-occurrence order and compiles the result", () => {
    const result = interpretMathInkRecognitionResult(
      recognition([
        {
          confidence: 0.98,
          expression: "y=b*x^2+a*x+c",
          format: "plot-expression",
        },
      ]),
    );

    expect(result).toMatchObject({
      schemaVersion: handwrittenFunctionInterpretationSchemaVersion,
      selected: {
        expression: "b*x^2+a*x+c",
        normalizedExpression: "b*x^2+a*x+c",
        parameters: ["b", "a", "c"],
      },
      status: "accepted",
    });
    expect(result.diagnostics).toEqual([]);
  });

  it("uses the production compiler for functions and reserved identifiers", () => {
    const result = interpretMathInkRecognitionResult(
      recognition([
        { expression: "sqrt()", format: "plot-expression" },
        { expression: "sin*x", format: "plot-expression" },
        { expression: "foo(x)", format: "plot-expression" },
      ]),
    );

    expect(result.status).toBe("rejected");
    expect(result.diagnostics.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "expression.function-requires-parentheses",
        "expression.invalid-function-arity",
        "handwriting.interpretation.unsupported-function",
        "handwriting.interpretation.no-valid-candidate",
      ]),
    );
  });

  it("rejects invalid parameter names and excessive parameter counts", () => {
    const names = Array.from({ length: 33 }, (_, index) => `a${index}`);
    const result = interpretMathInkRecognitionResult(
      recognition([
        { expression: "_a+x", format: "plot-expression" },
        { expression: names.join("+"), format: "plot-expression" },
      ]),
    );

    expect(result.status).toBe("rejected");
    expect(result.diagnostics.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "handwriting.interpretation.invalid-parameter",
        "handwriting.interpretation.parameter-limit",
      ]),
    );
  });

  it("ranks valid candidates by confidence and accepts a decisive lead", () => {
    const result = interpretMathInkRecognitionResult(
      recognition([
        { confidence: 0.7, expression: "x^3", format: "plot-expression" },
        { confidence: 0.95, expression: "x^2", format: "latex" },
        { confidence: 0.6, expression: "x", format: "plot-expression" },
      ]),
    );

    expect(result.status).toBe("accepted");
    expect(result.selected?.expression).toBe("x^(2)");
    expect(
      result.candidates.map(({ candidateIndex }) => candidateIndex),
    ).toEqual([1, 0, 2]);
  });

  it("uses format, parameter count and provider order as stable tie breakers", () => {
    const result = interpretMathInkRecognitionResult(
      recognition([
        { expression: "a*x", format: "latex" },
        { expression: "x", format: "plot-expression" },
        {
          expression: JSON.stringify({ label: "x+1" }),
          format: "jiix",
        },
      ]),
    );

    expect(result.status).toBe("ambiguous");
    expect(result.candidates.map(({ sourceFormat }) => sourceFormat)).toEqual([
      "plot-expression",
      "latex",
      "jiix",
    ]);
  });

  it("reports ambiguity for close distinct candidates", () => {
    const result = interpretMathInkRecognitionResult(
      recognition([
        { confidence: 0.8, expression: "x^2", format: "plot-expression" },
        { confidence: 0.75, expression: "x^3", format: "plot-expression" },
      ]),
    );

    expect(result.status).toBe("ambiguous");
    expect(result.selected).toBeNull();
    expect(result.diagnostics.map(({ code }) => code)).toContain(
      "handwriting.interpretation.ambiguous",
    );
  });

  it("deduplicates equivalent normalized candidates for ambiguity", () => {
    const result = interpretMathInkRecognitionResult(
      recognition([
        { confidence: 0.8, expression: "x + 1", format: "plot-expression" },
        { confidence: 0.79, expression: "x+1", format: "latex" },
      ]),
    );

    expect(result.status).toBe("accepted");
    expect(result.selected?.candidateIndex).toBe(0);
    expect(result.candidates).toHaveLength(2);
  });

  it("keeps an upstream unrecognized recovery candidate confirmable", () => {
    const result = interpretMathInkRecognitionResult(
      recognition(
        [{ confidence: 0.99, expression: "x^2", format: "plot-expression" }],
        "unrecognized",
      ),
    );

    expect(result.status).toBe("ambiguous");
    expect(result.selected).toBeNull();
    expect(result.candidates[0]?.expression).toBe("x^2");
  });

  it("bounds candidate processing and preserves provider diagnostics", () => {
    const candidates = Array.from(
      {
        length:
          handwrittenFunctionInterpretationLimits.maximumCandidateCount + 1,
      },
      (_, index): MathInkRecognitionCandidate => ({
        confidence: 1 - index / 100,
        expression: `x+${index}`,
        format: "plot-expression",
      }),
    );
    const source: MathInkRecognitionResult = {
      ...recognition(candidates),
      diagnostics: [
        {
          code: "provider.low-quality",
          message: "Ink quality is low.",
          severity: "warning",
        },
      ],
    };
    const before = JSON.stringify(source);

    const result = interpretMathInkRecognitionResult(source);

    expect(result.candidates).toHaveLength(
      handwrittenFunctionInterpretationLimits.maximumCandidateCount,
    );
    expect(result.diagnostics.map(({ code }) => code)).toEqual(
      expect.arrayContaining([
        "handwriting.interpretation.provider",
        "handwriting.interpretation.candidate-limit",
      ]),
    );
    expect(JSON.stringify(source)).toBe(before);
  });
});
