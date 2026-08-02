import {
  handwrittenFunctionLimits,
  type HandwrittenFunctionBounds,
  type HandwrittenFunctionCollectingState,
  type HandwrittenFunctionReadyState,
  type HandwrittenFunctionSessionAction,
  type HandwrittenFunctionSessionDiagnosticCode,
  type HandwrittenFunctionSessionState,
  type HandwrittenFunctionSessionTransition,
  type HandwrittenFunctionStroke,
  type MathInkPoint,
} from "./types";

export const initialHandwrittenFunctionSessionState: HandwrittenFunctionSessionState =
  { kind: "idle" };

function transition(
  state: HandwrittenFunctionSessionState,
  diagnostic: HandwrittenFunctionSessionDiagnosticCode | null = null,
): HandwrittenFunctionSessionTransition {
  return { diagnostic, state };
}

function validIdentifier(value: string): boolean {
  const length = value.trim().length;
  return length > 0 && length <= 160;
}

function finitePoint(point: MathInkPoint): boolean {
  return (
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    Number.isFinite(point.timeMs) &&
    point.timeMs >= 0
  );
}

function samePosition(left: MathInkPoint, right: MathInkPoint): boolean {
  return left.x === right.x && left.y === right.y;
}

function committedPointCount(
  strokes: readonly HandwrittenFunctionStroke[],
): number {
  return strokes.reduce((sum, stroke) => sum + stroke.points.length, 0);
}

function validPointForSession(
  state: HandwrittenFunctionCollectingState,
  point: MathInkPoint,
): HandwrittenFunctionSessionDiagnosticCode | null {
  if (!finitePoint(point) || point.timeMs < state.updatedAtMs) {
    return "handwriting.invalid-point";
  }
  if (
    point.timeMs - state.startedAtMs >
    handwrittenFunctionLimits.maximumSessionDurationMs
  ) {
    return "handwriting.duration-limit";
  }
  return null;
}

function appendPoint(
  state: HandwrittenFunctionCollectingState,
  point: MathInkPoint,
): {
  readonly diagnostic: HandwrittenFunctionSessionDiagnosticCode | null;
  readonly points: readonly MathInkPoint[];
} {
  const active = state.activeStroke;
  if (active === null) {
    return { diagnostic: "handwriting.invalid-action", points: [] };
  }
  const previous = active.points.at(-1);
  if (previous !== undefined && samePosition(previous, point)) {
    return { diagnostic: null, points: active.points };
  }
  if (
    active.points.length >= handwrittenFunctionLimits.maximumPointsPerStroke ||
    committedPointCount(state.strokes) + active.points.length >=
      handwrittenFunctionLimits.maximumTotalPointCount
  ) {
    return { diagnostic: "handwriting.point-limit", points: active.points };
  }
  return { diagnostic: null, points: [...active.points, point] };
}

function strokeHasGeometry(points: readonly MathInkPoint[]): boolean {
  const first = points[0];
  return (
    first !== undefined &&
    points.some((point) => point.x !== first.x || point.y !== first.y)
  );
}

export function calculateHandwrittenFunctionBounds(
  strokes: readonly HandwrittenFunctionStroke[],
): HandwrittenFunctionBounds | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let pointCount = 0;

  for (const stroke of strokes) {
    for (const point of stroke.points) {
      pointCount += 1;
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }

  if (pointCount === 0) return null;
  return {
    height: maxY - minY,
    maxX,
    maxY,
    minX,
    minY,
    width: maxX - minX,
  };
}

function readyState(
  state: HandwrittenFunctionCollectingState,
): HandwrittenFunctionReadyState | null {
  const bounds = calculateHandwrittenFunctionBounds(state.strokes);
  return bounds === null
    ? null
    : {
        bounds,
        kind: "ready",
        sessionId: state.sessionId,
        startedAtMs: state.startedAtMs,
        strokes: state.strokes,
        updatedAtMs: state.updatedAtMs,
      };
}

function reopen(
  state: Exclude<
    HandwrittenFunctionSessionState,
    HandwrittenFunctionCollectingState | { readonly kind: "idle" }
  >,
): HandwrittenFunctionCollectingState {
  return {
    activeStroke: null,
    kind: "collecting",
    sessionId: state.sessionId,
    startedAtMs: state.startedAtMs,
    strokes: state.strokes,
    updatedAtMs: state.updatedAtMs,
  };
}

export function reduceHandwrittenFunctionSession(
  state: HandwrittenFunctionSessionState,
  action: HandwrittenFunctionSessionAction,
): HandwrittenFunctionSessionTransition {
  if (action.kind === "cancel-session") {
    return transition(initialHandwrittenFunctionSessionState);
  }

  switch (action.kind) {
    case "begin": {
      if (state.kind !== "idle") {
        return transition(state, "handwriting.invalid-action");
      }
      if (!validIdentifier(action.sessionId)) {
        return transition(state, "handwriting.invalid-identifier");
      }
      if (!Number.isFinite(action.startedAtMs) || action.startedAtMs < 0) {
        return transition(state, "handwriting.invalid-point");
      }
      return transition({
        activeStroke: null,
        kind: "collecting",
        sessionId: action.sessionId,
        startedAtMs: action.startedAtMs,
        strokes: [],
        updatedAtMs: action.startedAtMs,
      });
    }
    case "start-stroke": {
      if (state.kind !== "collecting") {
        return transition(state, "handwriting.invalid-action");
      }
      if (state.activeStroke !== null) {
        return transition(state, "handwriting.active-stroke");
      }
      if (!validIdentifier(action.strokeId)) {
        return transition(state, "handwriting.invalid-identifier");
      }
      if (
        !Number.isInteger(action.pointerId) ||
        action.pointerId < 0 ||
        validPointForSession(state, action.point) !== null
      ) {
        return transition(state, "handwriting.invalid-point");
      }
      if (
        state.strokes.length >= handwrittenFunctionLimits.maximumStrokeCount
      ) {
        return transition(state, "handwriting.stroke-limit");
      }
      if (
        committedPointCount(state.strokes) >=
        handwrittenFunctionLimits.maximumTotalPointCount
      ) {
        return transition(state, "handwriting.point-limit");
      }
      return transition({
        ...state,
        activeStroke: {
          id: action.strokeId,
          pointerId: action.pointerId,
          points: [action.point],
        },
        updatedAtMs: action.point.timeMs,
      });
    }
    case "append-point": {
      if (state.kind !== "collecting" || state.activeStroke === null) {
        return transition(state, "handwriting.invalid-action");
      }
      if (state.activeStroke.pointerId !== action.pointerId) {
        return transition(state, "handwriting.pointer-mismatch");
      }
      const pointDiagnostic = validPointForSession(state, action.point);
      if (pointDiagnostic !== null) {
        return transition(state, pointDiagnostic);
      }
      const appended = appendPoint(state, action.point);
      return transition(
        {
          ...state,
          activeStroke: { ...state.activeStroke, points: appended.points },
          updatedAtMs: action.point.timeMs,
        },
        appended.diagnostic,
      );
    }
    case "finish-stroke": {
      if (state.kind !== "collecting" || state.activeStroke === null) {
        return transition(state, "handwriting.invalid-action");
      }
      if (state.activeStroke.pointerId !== action.pointerId) {
        return transition(state, "handwriting.pointer-mismatch");
      }
      const pointDiagnostic = validPointForSession(state, action.point);
      if (pointDiagnostic !== null) {
        return transition(state, pointDiagnostic);
      }
      const appended = appendPoint(state, action.point);
      if (!strokeHasGeometry(appended.points)) {
        return transition(
          {
            ...state,
            activeStroke: null,
            updatedAtMs: action.point.timeMs,
          },
          "handwriting.empty-stroke",
        );
      }
      return transition(
        {
          ...state,
          activeStroke: null,
          strokes: [
            ...state.strokes,
            { id: state.activeStroke.id, points: appended.points },
          ],
          updatedAtMs: action.point.timeMs,
        },
        appended.diagnostic,
      );
    }
    case "cancel-stroke": {
      if (state.kind !== "collecting" || state.activeStroke === null) {
        return transition(state, "handwriting.invalid-action");
      }
      if (
        action.pointerId !== undefined &&
        state.activeStroke.pointerId !== action.pointerId
      ) {
        return transition(state, "handwriting.pointer-mismatch");
      }
      return transition({ ...state, activeStroke: null });
    }
    case "complete-input": {
      if (state.kind !== "collecting") {
        return transition(state, "handwriting.invalid-action");
      }
      if (state.activeStroke !== null) {
        return transition(state, "handwriting.active-stroke");
      }
      const ready = readyState(state);
      return ready === null
        ? transition(state, "handwriting.empty-session")
        : transition(ready);
    }
    case "recognition-started": {
      if (state.kind !== "ready") {
        return transition(state, "handwriting.invalid-action");
      }
      if (!validIdentifier(action.recognitionId)) {
        return transition(state, "handwriting.invalid-identifier");
      }
      return transition({
        ...state,
        kind: "recognizing",
        recognitionId: action.recognitionId,
      });
    }
    case "recognition-resolved": {
      if (state.kind !== "recognizing") {
        return transition(state, "handwriting.invalid-action");
      }
      if (state.recognitionId !== action.recognitionId) {
        return transition(state, "handwriting.stale-recognition");
      }
      return transition({
        ...state,
        kind: "resolved",
        result: action.result,
      });
    }
    case "recognition-failed": {
      if (state.kind !== "recognizing") {
        return transition(state, "handwriting.invalid-action");
      }
      if (state.recognitionId !== action.recognitionId) {
        return transition(state, "handwriting.stale-recognition");
      }
      return transition({
        ...state,
        error: action.error,
        kind: "failed",
      });
    }
    case "reopen-input":
      return state.kind === "idle" || state.kind === "collecting"
        ? transition(state, "handwriting.invalid-action")
        : transition(reopen(state));
  }
}
