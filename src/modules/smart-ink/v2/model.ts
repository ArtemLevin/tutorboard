import type { SmartInkCandidate } from "../../smart-ink-spike/public";
import type { SmartInkArrowCandidate } from "../arrow-recognizer";
import type {
  SmartInkV2Features,
  SmartInkV2Kind,
  SmartInkV2Score,
  SmartInkV2ShapeKind,
} from "./types";

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function logistic(value: number): number {
  return 1 / (1 + Math.exp(-value));
}

function structuralAdjustment(
  kind: SmartInkV2ShapeKind,
  features: SmartInkV2Features,
): number {
  switch (kind) {
    case "line":
      return features.endpointEfficiency * 0.32 - features.retracing * 0.28;
    case "arrow":
      return features.endpointEfficiency * 0.12 - features.retracing * 0.18;
    case "circle":
    case "ellipse":
      return features.closure * 0.26 + features.turningConsistency * 0.12;
    case "rectangle":
    case "square":
    case "triangle":
      return features.closure * 0.2 + features.cornerConcentration * 0.18;
  }
}

function shapeProbability(
  kind: SmartInkV2ShapeKind,
  confidence: number,
  features: SmartInkV2Features,
): number {
  const centered = (confidence - 0.42) * 5;
  return clamp01(logistic(centered + structuralAdjustment(kind, features)));
}

export function ordinaryInkProbability(
  features: SmartInkV2Features,
  bestShapeProbability: number,
): number {
  const complexity =
    Math.min(1, features.selfIntersections / 3) * 1.4 +
    features.retracing * 1.1 +
    Math.max(0, features.pathToDiagonal - 4) * 0.18 +
    Math.max(0, features.speedVariation - 1.4) * 0.12;
  const shapeEvidence = bestShapeProbability * 2.6;
  return clamp01(logistic(-0.35 + complexity - shapeEvidence));
}

export function scoreSmartInkV2Candidates(
  primitiveCandidates: readonly SmartInkCandidate[],
  arrowCandidate: SmartInkArrowCandidate | null,
  features: SmartInkV2Features,
): readonly SmartInkV2Score[] {
  const shapes: SmartInkV2Score[] = primitiveCandidates.map((candidate) => ({
    kind: candidate.kind,
    probability: shapeProbability(
      candidate.kind,
      candidate.confidence,
      features,
    ),
  }));
  if (arrowCandidate !== null) {
    shapes.push({
      kind: "arrow",
      probability: shapeProbability(
        "arrow",
        arrowCandidate.confidence,
        features,
      ),
    });
  }
  const best = shapes.reduce(
    (maximum, score) => Math.max(maximum, score.probability),
    0,
  );
  const ordinaryScore: SmartInkV2Score = {
    kind: "ordinary-ink",
    probability: ordinaryInkProbability(features, best),
  };
  return [...shapes, ordinaryScore].sort(
    (left, right) =>
      right.probability - left.probability ||
      left.kind.localeCompare(right.kind),
  );
}

export function findV2Score(
  scores: readonly SmartInkV2Score[],
  kind: SmartInkV2Kind,
): number {
  return scores.find((score) => score.kind === kind)?.probability ?? 0;
}
