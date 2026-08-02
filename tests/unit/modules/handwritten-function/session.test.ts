import { describe, expect, it } from "vitest";

import {
  handwrittenFunctionLimits,
  initialHandwrittenFunctionSessionState,
  mathInkRecognitionResultSchemaVersion,
  reduceHandwrittenFunctionSession,
  type HandwrittenFunctionCollectingState,
  type HandwrittenFunctionSessionAction,
  type HandwrittenFunctionSessionState,
  type HandwrittenFunctionStroke,
  type MathInkRecognitionResult,
} from "../../../../src/modules/handwritten-function/public";

function reduce(
  state: HandwrittenFunctionSessionState,
  action: HandwrittenFunctionSessionAction,
): HandwrittenFunctionSessionState {
  return reduceHandwrittenFunctionSession(state, action).state;
}

function begin(): HandwrittenFunctionSessionState {
  return reduce(initialHandwrittenFunctionSessionState, {
    kind: "begin",
    sessionId: "session:test",
    startedAtMs: 1_000,
  });
}

function addStroke(
  state: HandwrittenFunctionSessionState,
  input: {
    readonly end: { readonly timeMs: number; readonly x: number; readonly y: number };
    readonly pointerId: number;
    readonly start: {
      readonly timeMs: number;
      readonly x: number;
      readonly y: number;
    };
    readonly strokeId: string;
  },
): HandwrittenFunctionSessionState {
  const started = reduce(state, {
    kind: "start-stroke",
    point: input.start,
    pointerId: input.pointerId,
    strokeId: input.strokeId,
  });
  return reduce(started, {
    kind: "finish-stroke",
    point: input.end,
    pointerId: input.pointerId,
  });
}

const recognizedResult: MathInkRecognitionResult = {
  candidates: [
    { confidence: 0.97, expression: "x^2", format: "plot-expression" },
  ],
  diagnostics: [],
  recognizerId: "fake",
  recognizerVersion: "0.1",
  schemaVersion: mathInkRecognitionResultSchemaVersion,
  status: "recognized",
};

describe("handwritten function session", () => {
  it("collects multiple strokes and completes one bounded capture", () => {
    let state = begin();
    state = addStroke(state, {
      end: { timeMs: 1_020, x: 30, y: 20 },
      pointerId: 1,
      start: { timeMs: 1_010, x: 10, y: 20 },
      strokeId: "stroke:one",
    });
    state = addStroke(state, {
      end: { timeMs: 1_040, x: 20, y: 50 },
      pointerId: 2,
      start: { timeMs: 1_030, x: 20, y: 30 },
      strokeId: "stroke:two",
    });

    const completed = reduceHandwrittenFunctionSession(state, {
      kind: "complete-input",
    });

    expect(completed.diagnostic).toBeNull();
    expect(completed.state).toMatchObject({
      bounds: {
        height: 30,
        maxX: 30,
        maxY: 50,
        minX: 10,
        minY: 20,
        width: 20,
      },
      kind: "ready",
      sessionId: "session:test",
    });
    if (completed.state.kind !== "ready") return;
    expect(completed.state.strokes.map(({ id }) => id)).toEqual([
      "stroke:one",
      "stroke:two",
    ]);
  });

  it("isolates pointer ownership and discards a cancelled active stroke", () => {
    let state = begin();
    state = reduce(state, {
      kind: "start-stroke",
      point: { timeMs: 1_010, x: 0, y: 0 },
      pointerId: 7,
      strokeId: "stroke:cancelled",
    });

    const mismatch = reduceHandwrittenFunctionSession(state, {
      kind: "append-point",
      point: { timeMs: 1_020, x: 1, y: 1 },
      pointerId: 8,
    });
    expect(mismatch.diagnostic).toBe("handwriting.pointer-mismatch");
    expect(mismatch.state).toBe(state);

    const cancelled = reduceHandwrittenFunctionSession(state, {
      kind: "cancel-stroke",
      pointerId: 7,
    });
    expect(cancelled.diagnostic).toBeNull();
    expect(cancelled.state).toMatchObject({
      activeStroke: null,
      kind: "collecting",
      strokes: [],
    });
  });

  it("rejects empty geometry while keeping the session usable", () => {
    let state = begin();
    state = reduce(state, {
      kind: "start-stroke",
      point: { timeMs: 1_010, x: 4, y: 4 },
      pointerId: 1,
      strokeId: "stroke:dot",
    });
    const finished = reduceHandwrittenFunctionSession(state, {
      kind: "finish-stroke",
      point: { timeMs: 1_020, x: 4, y: 4 },
      pointerId: 1,
    });

    expect(finished.diagnostic).toBe("handwriting.empty-stroke");
    expect(finished.state).toMatchObject({
      activeStroke: null,
      kind: "collecting",
      strokes: [],
    });
  });

  it("enforces duration, stroke and point budgets", () => {
    let state = begin();
    state = reduce(state, {
      kind: "start-stroke",
      point: { timeMs: 1_010, x: 0, y: 0 },
      pointerId: 1,
      strokeId: "stroke:limited",
    });
    const tooLate = reduceHandwrittenFunctionSession(state, {
      kind: "append-point",
      point: {
        timeMs:
          1_000 + handwrittenFunctionLimits.maximumSessionDurationMs + 1,
        x: 1,
        y: 1,
      },
      pointerId: 1,
    });
    expect(tooLate.diagnostic).toBe("handwriting.duration-limit");

    const stroke: HandwrittenFunctionStroke = {
      id: "stroke:fixture",
      points: [
        { timeMs: 1_000, x: 0, y: 0 },
        { timeMs: 1_001, x: 1, y: 1 },
      ],
    };
    const strokeLimited: HandwrittenFunctionCollectingState = {
      activeStroke: null,
      kind: "collecting",
      sessionId: "session:stroke-limit",
      startedAtMs: 1_000,
      strokes: Array.from(
        { length: handwrittenFunctionLimits.maximumStrokeCount },
        (_, index) => ({ ...stroke, id: `stroke:${index}` }),
      ),
      updatedAtMs: 2_000,
    };
    expect(
      reduceHandwrittenFunctionSession(strokeLimited, {
        kind: "start-stroke",
        point: { timeMs: 2_001, x: 2, y: 2 },
        pointerId: 2,
        strokeId: "stroke:overflow",
      }).diagnostic,
    ).toBe("handwriting.stroke-limit");

    const pointLimited: HandwrittenFunctionCollectingState = {
      activeStroke: {
        id: "stroke:point-limit",
        pointerId: 3,
        points: Array.from(
          { length: handwrittenFunctionLimits.maximumPointsPerStroke },
          (_, index) => ({ timeMs: 1_000 + index, x: index, y: index % 2 }),
        ),
      },
      kind: "collecting",
      sessionId: "session:point-limit",
      startedAtMs: 1_000,
      strokes: [],
      updatedAtMs:
        1_000 + handwrittenFunctionLimits.maximumPointsPerStroke - 1,
    };
    expect(
      reduceHandwrittenFunctionSession(pointLimited, {
        kind: "append-point",
        point: {
          timeMs: 1_000 + handwrittenFunctionLimits.maximumPointsPerStroke,
          x: handwrittenFunctionLimits.maximumPointsPerStroke,
          y: 0,
        },
        pointerId: 3,
      }).diagnostic,
    ).toBe("handwriting.point-limit");
  });

  it("ignores stale recognition completion and supports correction", () => {
    let state = begin();
    state = addStroke(state, {
      end: { timeMs: 1_020, x: 20, y: 10 },
      pointerId: 1,
      start: { timeMs: 1_010, x: 10, y: 10 },
      strokeId: "stroke:one",
    });
    state = reduce(state, { kind: "complete-input" });
    state = reduce(state, {
      kind: "recognition-started",
      recognitionId: "recognition:current",
    });

    const stale = reduceHandwrittenFunctionSession(state, {
      kind: "recognition-resolved",
      recognitionId: "recognition:old",
      result: recognizedResult,
    });
    expect(stale.diagnostic).toBe("handwriting.stale-recognition");
    expect(stale.state).toBe(state);

    state = reduce(state, {
      kind: "recognition-resolved",
      recognitionId: "recognition:current",
      result: recognizedResult,
    });
    expect(state).toMatchObject({
      kind: "resolved",
      result: { status: "recognized" },
    });

    state = reduce(state, { kind: "reopen-input" });
    expect(state).toMatchObject({
      activeStroke: null,
      kind: "collecting",
      strokes: [{ id: "stroke:one" }],
    });
  });

  it("cancels the complete transient session from every active phase", () => {
    let state = begin();
    state = addStroke(state, {
      end: { timeMs: 1_020, x: 10, y: 10 },
      pointerId: 1,
      start: { timeMs: 1_010, x: 0, y: 0 },
      strokeId: "stroke:one",
    });
    state = reduce(state, { kind: "complete-input" });

    expect(reduce(state, { kind: "cancel-session" })).toEqual({ kind: "idle" });
  });
});
