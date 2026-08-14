import type { PenStrokeObject, Vec2 } from "../../../core/public";
import type {
  SmartInkCandidate,
  SmartInkPrimitiveKind,
  SmartInkProposal,
} from "../../smart-ink-spike/public";
import type {
  SmartInkArrowCandidate,
  SmartInkArrowProposal,
} from "../arrow-recognizer";

export const smartInkV2Version = "tutorboard.smart-ink/2.0" as const;

export type SmartInkV2ShapeKind = SmartInkPrimitiveKind | "arrow";
export type SmartInkV2Kind = SmartInkV2ShapeKind | "ordinary-ink";
export type SmartInkV2Candidate = SmartInkCandidate | SmartInkArrowCandidate;

export interface SmartInkTracePoint extends Vec2 {
  readonly pressure: number;
  readonly timestampMs: number;
}

export interface SmartInkTrace {
  readonly pointerType: "mouse" | "pen" | "touch" | "unknown";
  readonly points: readonly SmartInkTracePoint[];
  readonly sourceStrokeId: PenStrokeObject["id"] | string;
}

export interface SmartInkV2Features {
  readonly aspectRatio: number;
  readonly closure: number;
  readonly cornerConcentration: number;
  readonly endpointEfficiency: number;
  readonly meanPressure: number;
  readonly pathToDiagonal: number;
  readonly pressureVariation: number;
  readonly retracing: number;
  readonly selfIntersections: number;
  readonly speedVariation: number;
  readonly turningConsistency: number;
}

export interface SmartInkV2Score {
  readonly kind: SmartInkV2Kind;
  readonly probability: number;
}

export type SmartInkV2DecisionStatus =
  "accepted" | "ambiguous" | "ordinary-ink" | "unrecognized";

export interface SmartInkV2Decision {
  readonly arrowProposal: SmartInkArrowProposal;
  readonly candidate: SmartInkV2Candidate | null;
  readonly features: SmartInkV2Features;
  readonly legacyProposal: SmartInkProposal;
  readonly ordinaryInkProbability: number;
  readonly scores: readonly SmartInkV2Score[];
  readonly selectedKind: SmartInkV2Kind;
  readonly snapQuality: number;
  readonly status: SmartInkV2DecisionStatus;
  readonly version: typeof smartInkV2Version;
}

export interface SmartInkV2Policy {
  readonly ambiguityMargin: number;
  readonly classThresholds: Readonly<Record<SmartInkV2ShapeKind, number>>;
  readonly minimumSnapQuality: number;
  readonly ordinaryInkMargin: number;
}
