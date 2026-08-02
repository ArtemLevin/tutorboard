import { describe, expect, it } from "vitest";

import {
  createFakeMathInkRecognizer,
  createMathInkRecognitionRequest,
  isMathInkRecognitionAbortError,
  mathInkRecognitionRequestSchemaVersion,
  mathInkRecognitionResultSchemaVersion,
  type HandwrittenFunctionReadyState,
  type MathInkRecognitionResult,
} from "../../../../src/modules/handwritten-function/public";

function readyState(): HandwrittenFunctionReadyState {
  return {
    bounds: {
      height: 20,
      maxX: 50,
      maxY: 40,
      minX: 10,
      minY: 20,
      width: 40,
    },
    kind: "ready",
    sessionId: "session:normalize",
    startedAtMs: 1_000,
    strokes: [
      {
        id: "stroke:one",
        points: [
          { timeMs: 1_010, x: 10, y: 20 },
          { timeMs: 1_020, x: 50, y: 40 },
        ],
      },
      {
        id: "stroke:two",
        points: [
          { timeMs: 1_030, x: 30, y: 20 },
          { timeMs: 1_040, x: 30, y: 40 },
        ],
      },
    ],
    updatedAtMs: 1_040,
  };
}

const result: MathInkRecognitionResult = {
  candidates: [
    {
      confidence: 0.95,
      expression: "x^2+1",
      format: "plot-expression",
    },
  ],
  diagnostics: [],
  recognizerId: "fake-provider",
  recognizerVersion: "0.1",
  schemaVersion: mathInkRecognitionResultSchemaVersion,
  status: "recognized",
};

describe("math ink recognition boundary", () => {
  it("normalizes world points into one aspect-preserving unit box", () => {
    const request = createMathInkRecognitionRequest(
      readyState(),
      "recognition:one",
    );

    expect(request).toMatchObject({
      normalization: { originX: 10, originY: 20, scale: 40 },
      normalizedHeight: 0.5,
      normalizedWidth: 1,
      recognitionId: "recognition:one",
      schemaVersion: mathInkRecognitionRequestSchemaVersion,
      sessionId: "session:normalize",
    });
    expect(request.strokes).toEqual([
      {
        id: "stroke:one",
        points: [
          { timeMs: 10, x: 0, y: 0 },
          { timeMs: 20, x: 1, y: 0.5 },
        ],
      },
      {
        id: "stroke:two",
        points: [
          { timeMs: 30, x: 0.5, y: 0 },
          { timeMs: 40, x: 0.5, y: 0.5 },
        ],
      },
    ]);
  });

  it("rejects an invalid recognition identity before provider work", () => {
    expect(() => createMathInkRecognitionRequest(readyState(), " ")).toThrow(
      "Math ink recognition id is invalid.",
    );
  });

  it("provides deterministic copied requests and results", async () => {
    const provider = createFakeMathInkRecognizer({ result });
    const request = createMathInkRecognitionRequest(
      readyState(),
      "recognition:copy",
    );
    const controller = new AbortController();

    const received = await provider.recognize(request, controller.signal);
    expect(received).toEqual(result);
    expect(received).not.toBe(result);
    expect(provider.getRequests()).toEqual([request]);
    expect(provider.getRequests()[0]).not.toBe(request);
  });

  it("honors cancellation before and during the asynchronous boundary", async () => {
    const provider = createFakeMathInkRecognizer({ result });
    const request = createMathInkRecognitionRequest(
      readyState(),
      "recognition:abort",
    );

    const preAborted = new AbortController();
    preAborted.abort();
    await expect(
      provider.recognize(request, preAborted.signal),
    ).rejects.toSatisfy(isMathInkRecognitionAbortError);

    const inFlight = new AbortController();
    const operation = provider.recognize(request, inFlight.signal);
    inFlight.abort();
    await expect(operation).rejects.toSatisfy(isMathInkRecognitionAbortError);
    expect(provider.getRequests()).toEqual([]);
  });
});
