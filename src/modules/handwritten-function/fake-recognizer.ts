import type {
  MathInkRecognitionRequest,
  MathInkRecognitionResult,
  MathInkRecognizer,
} from "./types";

export class MathInkRecognitionAbortError extends Error {
  public constructor() {
    super("Math ink recognition was cancelled.");
    this.name = "MathInkRecognitionAbortError";
  }
}

export interface FakeMathInkRecognizer extends MathInkRecognizer {
  getRequests(): readonly MathInkRecognitionRequest[];
}

export interface CreateFakeMathInkRecognizerOptions {
  readonly id?: string;
  readonly result: MathInkRecognitionResult;
  readonly version?: string;
}

function cloneRequest(
  request: MathInkRecognitionRequest,
): MathInkRecognitionRequest {
  return {
    ...request,
    normalization: { ...request.normalization },
    sourceBounds: { ...request.sourceBounds },
    strokes: request.strokes.map((stroke) => ({
      id: stroke.id,
      points: stroke.points.map((point) => ({ ...point })),
    })),
  };
}

function cloneResult(
  result: MathInkRecognitionResult,
): MathInkRecognitionResult {
  return {
    ...result,
    candidates: result.candidates.map((candidate) => ({ ...candidate })),
    diagnostics: result.diagnostics.map((diagnostic) => ({ ...diagnostic })),
  };
}

export function isMathInkRecognitionAbortError(
  error: unknown,
): error is MathInkRecognitionAbortError {
  return error instanceof MathInkRecognitionAbortError;
}

export function createFakeMathInkRecognizer({
  id = "tutorboard.fake-math-ink",
  result,
  version = "0.1",
}: CreateFakeMathInkRecognizerOptions): FakeMathInkRecognizer {
  const requests: MathInkRecognitionRequest[] = [];

  return {
    id,
    version,
    getRequests: () => requests.map(cloneRequest),
    async recognize(request, signal) {
      if (signal.aborted) throw new MathInkRecognitionAbortError();
      const captured = cloneRequest(request);
      await Promise.resolve();
      if (signal.aborted) throw new MathInkRecognitionAbortError();
      requests.push(captured);
      return cloneResult(result);
    },
  };
}
