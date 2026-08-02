export const handwrittenFunctionToolId = "math.handwritten-function" as const;
export const handwrittenFunctionSessionSchemaVersion =
  "tutorboard.handwritten-function-session/0.1" as const;
export const mathInkRecognitionRequestSchemaVersion =
  "tutorboard.math-ink-request/0.1" as const;
export const mathInkRecognitionResultSchemaVersion =
  "tutorboard.math-ink-result/0.1" as const;

export const handwrittenFunctionLimits = {
  maximumSessionDurationMs: 300_000,
  maximumStrokeCount: 128,
  maximumPointsPerStroke: 4_096,
  maximumTotalPointCount: 16_384,
} as const;

export interface MathInkPoint {
  readonly timeMs: number;
  readonly x: number;
  readonly y: number;
}

export interface HandwrittenFunctionStroke {
  readonly id: string;
  readonly points: readonly MathInkPoint[];
}

export interface HandwrittenFunctionBounds {
  readonly height: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly minX: number;
  readonly minY: number;
  readonly width: number;
}

export interface NormalizedMathInkPoint {
  readonly timeMs: number;
  readonly x: number;
  readonly y: number;
}

export interface NormalizedMathInkStroke {
  readonly id: string;
  readonly points: readonly NormalizedMathInkPoint[];
}

export interface MathInkNormalizationTransform {
  readonly originX: number;
  readonly originY: number;
  readonly scale: number;
}

export interface MathInkRecognitionRequest {
  readonly normalization: MathInkNormalizationTransform;
  readonly normalizedHeight: number;
  readonly normalizedWidth: number;
  readonly recognitionId: string;
  readonly schemaVersion: typeof mathInkRecognitionRequestSchemaVersion;
  readonly sessionId: string;
  readonly sourceBounds: HandwrittenFunctionBounds;
  readonly strokes: readonly NormalizedMathInkStroke[];
}

export type MathInkRecognitionFormat = "jiix" | "latex" | "plot-expression";

export interface MathInkRecognitionCandidate {
  readonly confidence?: number;
  readonly expression: string;
  readonly format: MathInkRecognitionFormat;
}

export type MathInkRecognitionDiagnosticSeverity = "error" | "info" | "warning";

export interface MathInkRecognitionDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly severity: MathInkRecognitionDiagnosticSeverity;
}

export type MathInkRecognitionStatus =
  "ambiguous" | "recognized" | "unrecognized";

export interface MathInkRecognitionResult {
  readonly candidates: readonly MathInkRecognitionCandidate[];
  readonly diagnostics: readonly MathInkRecognitionDiagnostic[];
  readonly recognizerId: string;
  readonly recognizerVersion: string;
  readonly schemaVersion: typeof mathInkRecognitionResultSchemaVersion;
  readonly status: MathInkRecognitionStatus;
}

export interface MathInkRecognizer {
  readonly id: string;
  readonly version: string;
  recognize(
    request: MathInkRecognitionRequest,
    signal: AbortSignal,
  ): Promise<MathInkRecognitionResult>;
}

interface HandwrittenFunctionCapture {
  readonly bounds: HandwrittenFunctionBounds;
  readonly sessionId: string;
  readonly startedAtMs: number;
  readonly strokes: readonly HandwrittenFunctionStroke[];
  readonly updatedAtMs: number;
}

export interface HandwrittenFunctionIdleState {
  readonly kind: "idle";
}

export interface HandwrittenFunctionCollectingState {
  readonly activeStroke: {
    readonly id: string;
    readonly pointerId: number;
    readonly points: readonly MathInkPoint[];
  } | null;
  readonly kind: "collecting";
  readonly sessionId: string;
  readonly startedAtMs: number;
  readonly strokes: readonly HandwrittenFunctionStroke[];
  readonly updatedAtMs: number;
}

export interface HandwrittenFunctionReadyState extends HandwrittenFunctionCapture {
  readonly kind: "ready";
}

export interface HandwrittenFunctionRecognizingState extends HandwrittenFunctionCapture {
  readonly kind: "recognizing";
  readonly recognitionId: string;
}

export interface HandwrittenFunctionResolvedState extends HandwrittenFunctionCapture {
  readonly kind: "resolved";
  readonly recognitionId: string;
  readonly result: MathInkRecognitionResult;
}

export interface HandwrittenFunctionFailedState extends HandwrittenFunctionCapture {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly retryable: boolean;
  };
  readonly kind: "failed";
  readonly recognitionId: string;
}

export type HandwrittenFunctionSessionState =
  | HandwrittenFunctionCollectingState
  | HandwrittenFunctionFailedState
  | HandwrittenFunctionIdleState
  | HandwrittenFunctionReadyState
  | HandwrittenFunctionRecognizingState
  | HandwrittenFunctionResolvedState;

export type HandwrittenFunctionSessionAction =
  | {
      readonly kind: "begin";
      readonly sessionId: string;
      readonly startedAtMs: number;
    }
  | {
      readonly kind: "start-stroke";
      readonly point: MathInkPoint;
      readonly pointerId: number;
      readonly strokeId: string;
    }
  | {
      readonly kind: "append-point";
      readonly point: MathInkPoint;
      readonly pointerId: number;
    }
  | {
      readonly kind: "finish-stroke";
      readonly point: MathInkPoint;
      readonly pointerId: number;
    }
  | {
      readonly kind: "cancel-stroke";
      readonly pointerId?: number;
    }
  | { readonly kind: "complete-input" }
  | {
      readonly kind: "recognition-started";
      readonly recognitionId: string;
    }
  | {
      readonly kind: "recognition-resolved";
      readonly recognitionId: string;
      readonly result: MathInkRecognitionResult;
    }
  | {
      readonly error: {
        readonly code: string;
        readonly message: string;
        readonly retryable: boolean;
      };
      readonly kind: "recognition-failed";
      readonly recognitionId: string;
    }
  | { readonly kind: "reopen-input" }
  | { readonly kind: "cancel-session" };

export type HandwrittenFunctionSessionDiagnosticCode =
  | "handwriting.active-stroke"
  | "handwriting.duration-limit"
  | "handwriting.empty-session"
  | "handwriting.empty-stroke"
  | "handwriting.invalid-action"
  | "handwriting.invalid-identifier"
  | "handwriting.invalid-point"
  | "handwriting.point-limit"
  | "handwriting.pointer-mismatch"
  | "handwriting.stale-recognition"
  | "handwriting.stroke-limit";

export interface HandwrittenFunctionSessionTransition {
  readonly diagnostic: HandwrittenFunctionSessionDiagnosticCode | null;
  readonly state: HandwrittenFunctionSessionState;
}
