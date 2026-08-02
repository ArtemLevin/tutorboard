import {
  mathInkRecognitionRequestSchemaVersion,
  type HandwrittenFunctionReadyState,
  type MathInkRecognitionRequest,
  type NormalizedMathInkStroke,
} from "./types";

const minimumNormalizationScale = 1e-9;

function validIdentifier(value: string): boolean {
  const length = value.trim().length;
  return length > 0 && length <= 160;
}

export function createMathInkRecognitionRequest(
  state: HandwrittenFunctionReadyState,
  recognitionId: string,
): MathInkRecognitionRequest {
  if (!validIdentifier(recognitionId)) {
    throw new Error("Math ink recognition id is invalid.");
  }

  const scale = Math.max(
    state.bounds.width,
    state.bounds.height,
    minimumNormalizationScale,
  );
  const strokes: readonly NormalizedMathInkStroke[] = state.strokes.map(
    (stroke) => ({
      id: stroke.id,
      points: stroke.points.map((point) => ({
        timeMs: point.timeMs - state.startedAtMs,
        x: (point.x - state.bounds.minX) / scale,
        y: (point.y - state.bounds.minY) / scale,
      })),
    }),
  );

  return {
    normalization: {
      originX: state.bounds.minX,
      originY: state.bounds.minY,
      scale,
    },
    normalizedHeight: state.bounds.height / scale,
    normalizedWidth: state.bounds.width / scale,
    recognitionId,
    schemaVersion: mathInkRecognitionRequestSchemaVersion,
    sessionId: state.sessionId,
    sourceBounds: state.bounds,
    strokes,
  };
}
