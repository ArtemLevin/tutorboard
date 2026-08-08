import type {
  ActorId,
  Solid3DId,
  SolidLearningAttemptId,
} from "../board/identifiers";

export const maximumLearningTraceActions = 128;
export const maximumLearningHints = 24;
export const maximumLearningDiagnostics = 64;

export type SolidLearningMode = "guided" | "assessment" | "teacher-demo";
export type SolidLearningPhase =
  | "intro"
  | "prediction"
  | "construction"
  | "reasoning"
  | "measurement"
  | "reflection"
  | "completed";

export type SolidElementRef =
  | { readonly kind: "vertex"; readonly id: string }
  | { readonly kind: "edge"; readonly id: string }
  | { readonly kind: "face"; readonly id: string }
  | { readonly kind: "point"; readonly id: string }
  | { readonly kind: "section-segment"; readonly id: string };

export interface SolidSectionPrediction {
  readonly vertexCount: number | null;
  readonly polygonKind: string;
  readonly edgeIds: readonly string[];
  readonly parallelSidePairs: readonly (readonly [string, string])[];
  readonly confidence: "confident" | "unsure" | "stuck";
  readonly submitted: boolean;
  readonly score: number | null;
}

export type SolidConstructionAction =
  | { readonly kind: "select-face"; readonly faceId: string }
  | {
      readonly kind: "add-derived-point";
      readonly edgeId: string;
      readonly parameter: number;
    }
  | {
      readonly kind: "add-trace-segment";
      readonly faceId: string;
      readonly fromPointId: string;
      readonly toPointId: string;
    }
  | {
      readonly kind: "close-contour";
      readonly orderedPointIds: readonly string[];
    };

export interface SolidConstructionTraceEntry {
  readonly id: string;
  readonly action: SolidConstructionAction;
  readonly accepted: boolean;
  readonly diagnosticCode: SolidLearningDiagnosticCode | null;
  readonly explanation: string;
  readonly timestamp: string;
}

export interface SolidConstructionState {
  readonly trace: readonly SolidConstructionTraceEntry[];
  readonly completed: boolean;
}

export interface SolidReasoningStep {
  readonly statementId: string;
  readonly ruleId: string;
  readonly premiseIds: readonly string[];
  readonly accepted: boolean;
}

export type ExactValue =
  | {
      readonly kind: "rational";
      readonly numerator: number;
      readonly denominator: number;
    }
  | {
      readonly kind: "radical";
      readonly coefficientNumerator: number;
      readonly coefficientDenominator: number;
      readonly radicand: number;
    }
  | { readonly kind: "decimal"; readonly value: number };

export interface SolidLearningAnswer {
  readonly taskId: string;
  readonly raw: string;
  readonly formulaId: string | null;
  readonly unit: string;
  readonly parsed: ExactValue | null;
  readonly correct: boolean;
  readonly timestamp: string;
}

export interface SolidHintUsage {
  readonly id: string;
  readonly ladderId: string;
  readonly level: 1 | 2 | 3;
  readonly relatedElement: SolidElementRef | null;
  readonly timestamp: string;
}

export type SolidLearningDiagnosticCode =
  | "points-on-different-faces"
  | "missed-edge-intersection"
  | "wrong-contour-order"
  | "self-intersection"
  | "point-outside-edge"
  | "segment-outside-section-plane"
  | "duplicate-or-collinear-seeds"
  | "invalid-proof-premises"
  | "incorrect-formula"
  | "incorrect-unit";

export interface SolidLearningDiagnostic {
  readonly id: string;
  readonly code: SolidLearningDiagnosticCode;
  readonly message: string;
  readonly element: SolidElementRef | null;
  readonly timestamp: string;
}

export interface SolidLearningResult {
  readonly completed: boolean;
  readonly predictionScore: number;
  readonly constructionAccuracy: number;
  readonly reasoningAccuracy: number;
  readonly measurementAccuracy: number;
  readonly quizScore: number;
  readonly maximumHintLevel: number;
  readonly skillScores: Readonly<Record<string, number>>;
}

export interface SolidLearningCheckpoint {
  readonly parameter: number;
  readonly area: number;
  readonly perimeter: number;
  readonly vertexCount: number;
  readonly timestamp: string;
}

export interface Solid3DLearningAttempt {
  readonly id: SolidLearningAttemptId;
  readonly solidId: Solid3DId;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly actorId: ActorId;
  readonly mode: SolidLearningMode;
  readonly phase: SolidLearningPhase;
  readonly prediction: SolidSectionPrediction | null;
  readonly construction: SolidConstructionState;
  readonly reasoning: readonly SolidReasoningStep[];
  readonly answers: readonly SolidLearningAnswer[];
  readonly hints: readonly SolidHintUsage[];
  readonly diagnostics: readonly SolidLearningDiagnostic[];
  readonly checkpoints: readonly SolidLearningCheckpoint[];
  readonly quizAnswers: Readonly<Record<string, string>>;
  readonly result: SolidLearningResult | null;
  readonly revision: number;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly schemaVersion: "1.0";
}

export type SolidLearningAttemptAction =
  | { readonly kind: "set-phase"; readonly phase: SolidLearningPhase }
  | {
      readonly kind: "submit-prediction";
      readonly prediction: SolidSectionPrediction;
    }
  | {
      readonly kind: "construction-step";
      readonly entry: SolidConstructionTraceEntry;
    }
  | { readonly kind: "add-reasoning"; readonly step: SolidReasoningStep }
  | { readonly kind: "submit-answer"; readonly answer: SolidLearningAnswer }
  | { readonly kind: "use-hint"; readonly hint: SolidHintUsage }
  | {
      readonly kind: "add-diagnostic";
      readonly diagnostic: SolidLearningDiagnostic;
    }
  | {
      readonly kind: "add-checkpoint";
      readonly checkpoint: SolidLearningCheckpoint;
    }
  | {
      readonly kind: "answer-quiz";
      readonly itemId: string;
      readonly answer: string;
    }
  | { readonly kind: "restore"; readonly snapshot: Solid3DLearningAttempt };
