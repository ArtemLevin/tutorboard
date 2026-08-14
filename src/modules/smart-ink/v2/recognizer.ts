import type { PenStrokeObject, Vec2 } from "../../../core/public";
import {
  recognizeSmartInkStroke,
  type SmartInkCandidate,
} from "../../smart-ink-spike/public";
import { recognizeSmartInkArrow } from "../arrow-recognizer";
import { extractSmartInkV2Features } from "./features";
import { findV2Score, scoreSmartInkV2Candidates } from "./model";
import { createSmartInkTrace } from "./trace";
import {
  smartInkV2Version,
  type SmartInkV2Candidate,
  type SmartInkV2Decision,
  type SmartInkV2Policy,
  type SmartInkV2ShapeKind,
} from "./types";

export const smartInkV2DefaultPolicy: SmartInkV2Policy = {
  ambiguityMargin: 0.07,
  classThresholds: {
    arrow: 0.75,
    circle: 0.54,
    ellipse: 0.54,
    line: 0.56,
    rectangle: 0.55,
    square: 0.55,
    triangle: 0.55,
  },
  minimumSnapQuality: 0.55,
  ordinaryInkMargin: 0.04,
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function snapQuality(candidate: SmartInkV2Candidate): number {
  const residual =
    candidate.diagnostics.normalizedResidual ??
    candidate.diagnostics.normalizedRadialResidual ??
    candidate.diagnostics.shaftResidual ??
    Math.min(1, candidate.fitError / 10);
  return clamp01(1 - Math.max(0, residual) * 3.2);
}

function primitiveCandidate(
  proposal: ReturnType<typeof recognizeSmartInkStroke>,
  kind: SmartInkV2ShapeKind,
): SmartInkCandidate | null {
  if (kind === "arrow") return null;
  return (
    proposal.candidates.find((candidate) => candidate.kind === kind) ?? null
  );
}

function pairwiseKind(
  selected: SmartInkV2ShapeKind,
  scores: ReturnType<typeof scoreSmartInkV2Candidates>,
  proposal: ReturnType<typeof recognizeSmartInkStroke>,
): SmartInkV2ShapeKind {
  if (selected === "circle" || selected === "ellipse") {
    const ellipse = proposal.candidates.find(
      (candidate) => candidate.kind === "ellipse",
    );
    const axisRatio = ellipse?.diagnostics.axisRatio ?? 0;
    const circleScore = findV2Score(scores, "circle");
    const ellipseScore = findV2Score(scores, "ellipse");
    if (axisRatio >= 0.78 && circleScore + 0.035 >= ellipseScore)
      return "circle";
    if (axisRatio < 0.72 && ellipseScore + 0.02 >= circleScore)
      return "ellipse";
  }
  if (selected === "square" || selected === "rectangle") {
    const square = proposal.candidates.find(
      (candidate) => candidate.kind === "square",
    );
    const aspectRatio = square?.diagnostics.aspectRatio ?? 1;
    const squareScore = findV2Score(scores, "square");
    const rectangleScore = findV2Score(scores, "rectangle");
    if (aspectRatio <= 1.22 && squareScore + 0.04 >= rectangleScore)
      return "square";
    if (aspectRatio >= 1.42 && rectangleScore + 0.03 >= squareScore)
      return "rectangle";
  }
  return selected;
}

export function recognizeSmartInkV2(
  stroke: PenStrokeObject,
  worldPoints: readonly Vec2[],
  policy: SmartInkV2Policy = smartInkV2DefaultPolicy,
): SmartInkV2Decision {
  const trace = createSmartInkTrace(stroke, worldPoints);
  const legacyProposal = recognizeSmartInkStroke(stroke.id, worldPoints, {
    ambiguityMargin: 0,
    minimumConfidence: 0,
    sampleCount: 96,
  });
  const arrowProposal = recognizeSmartInkArrow(worldPoints);
  const features = extractSmartInkV2Features(trace, legacyProposal);
  const scores = scoreSmartInkV2Candidates(
    legacyProposal.candidates,
    arrowProposal.candidate,
    features,
  );
  const topShape = scores.find((score) => score.kind !== "ordinary-ink");
  const ordinary = findV2Score(scores, "ordinary-ink");
  if (topShape === undefined || topShape.kind === "ordinary-ink") {
    return {
      arrowProposal,
      candidate: null,
      features,
      legacyProposal,
      ordinaryInkProbability: ordinary,
      scores,
      selectedKind: "ordinary-ink",
      snapQuality: 0,
      status: "ordinary-ink",
      version: smartInkV2Version,
    };
  }
  const selectedKind = pairwiseKind(topShape.kind, scores, legacyProposal);
  const selectedProbability = findV2Score(scores, selectedKind);
  const candidate =
    selectedKind === "arrow"
      ? arrowProposal.candidate
      : primitiveCandidate(legacyProposal, selectedKind);
  const quality = candidate === null ? 0 : snapQuality(candidate);
  const competingShape = scores.find(
    (score) => score.kind !== "ordinary-ink" && score.kind !== selectedKind,
  );
  const classThreshold = policy.classThresholds[selectedKind];
  const ordinaryWins =
    ordinary + policy.ordinaryInkMargin >= selectedProbability;
  const ambiguous =
    competingShape !== undefined &&
    selectedProbability - competingShape.probability < policy.ambiguityMargin;
  const status =
    candidate === null || selectedProbability < classThreshold
      ? "unrecognized"
      : ordinaryWins
        ? "ordinary-ink"
        : ambiguous
          ? "ambiguous"
          : quality < policy.minimumSnapQuality
            ? "unrecognized"
            : "accepted";
  return {
    arrowProposal,
    candidate: status === "accepted" ? candidate : null,
    features,
    legacyProposal,
    ordinaryInkProbability: ordinary,
    scores,
    selectedKind: status === "ordinary-ink" ? "ordinary-ink" : selectedKind,
    snapQuality: quality,
    status,
    version: smartInkV2Version,
  };
}
