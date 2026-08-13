import type { Vec2 } from "../../core/public";

export const smartInkArrowRecognizerVersion =
  "tutorboard.smart-ink-arrow/1.1" as const;

export interface SmartInkArrowGeometry {
  readonly headLeft: Vec2;
  readonly headRight: Vec2;
  readonly kind: "arrow";
  readonly start: Vec2;
  readonly tip: Vec2;
}

export interface SmartInkArrowCandidate {
  readonly confidence: number;
  readonly diagnostics: Readonly<Record<string, number>>;
  readonly fitError: number;
  readonly geometry: SmartInkArrowGeometry;
  readonly kind: "arrow";
}

export interface SmartInkArrowProposal {
  readonly candidate: SmartInkArrowCandidate | null;
  readonly diagnostics: readonly string[];
  readonly recognizerVersion: typeof smartInkArrowRecognizerVersion;
  readonly sampledPointCount: number;
  readonly status: "recognized" | "unrecognized";
}

const epsilon = 1e-9;
const sampleCount = 96;
const minimumConfidence = 0.7;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function distance(left: Vec2, right: Vec2): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function totalLength(points: readonly Vec2[]): number {
  let result = 0;
  for (let index = 1; index < points.length; index += 1) {
    result += distance(points[index - 1]!, points[index]!);
  }
  return result;
}

function resample(input: readonly Vec2[]): readonly Vec2[] {
  const points = input.filter((point, index) => {
    const previous = input[index - 1];
    return previous === undefined || distance(previous, point) > epsilon;
  });
  const length = totalLength(points);
  if (points.length < 2 || length <= epsilon) return points;
  const step = length / (sampleCount - 1);
  const result: Vec2[] = [{ ...points[0]! }];
  let segmentIndex = 1;
  let segmentStartDistance = 0;
  let segmentLength = distance(points[0]!, points[1]!);
  for (let sampleIndex = 1; sampleIndex < sampleCount - 1; sampleIndex += 1) {
    const target = sampleIndex * step;
    while (
      segmentIndex < points.length - 1 &&
      segmentStartDistance + segmentLength < target
    ) {
      segmentStartDistance += segmentLength;
      segmentIndex += 1;
      segmentLength = distance(
        points[segmentIndex - 1]!,
        points[segmentIndex]!,
      );
    }
    const ratio =
      segmentLength <= epsilon
        ? 0
        : clamp01((target - segmentStartDistance) / segmentLength);
    const start = points[segmentIndex - 1]!;
    const end = points[segmentIndex]!;
    result.push({
      x: start.x + (end.x - start.x) * ratio,
      y: start.y + (end.y - start.y) * ratio,
    });
  }
  result.push({ ...points.at(-1)! });
  return result;
}

function pointToSegmentDistance(point: Vec2, start: Vec2, end: Vec2): number {
  const delta = { x: end.x - start.x, y: end.y - start.y };
  const lengthSquared = delta.x * delta.x + delta.y * delta.y;
  if (lengthSquared <= epsilon) return distance(point, start);
  const ratio = clamp01(
    ((point.x - start.x) * delta.x + (point.y - start.y) * delta.y) /
      lengthSquared,
  );
  return distance(point, {
    x: start.x + delta.x * ratio,
    y: start.y + delta.y * ratio,
  });
}

function rms(
  points: readonly Vec2[],
  segments: readonly (readonly [Vec2, Vec2])[],
): number {
  return Math.sqrt(
    points.reduce((sum, point) => {
      const nearest = Math.min(
        ...segments.map(([start, end]) =>
          pointToSegmentDistance(point, start, end),
        ),
      );
      return sum + nearest * nearest;
    }, 0) / points.length,
  );
}

function dot(left: Vec2, right: Vec2): number {
  return left.x * right.x + left.y * right.y;
}

function cross(left: Vec2, right: Vec2): number {
  return left.x * right.y - left.y * right.x;
}

function fitDirection(points: readonly Vec2[]): SmartInkArrowCandidate {
  const start = points[0]!;
  const minimumTipIndex = Math.floor(points.length * 0.28);
  const maximumTipIndex = Math.ceil(points.length * 0.8);
  let tipIndex = minimumTipIndex;
  let shaftLength = 0;
  for (let index = minimumTipIndex; index <= maximumTipIndex; index += 1) {
    const length = distance(start, points[index]!);
    if (length > shaftLength) {
      shaftLength = length;
      tipIndex = index;
    }
  }
  const tip = points[tipIndex]!;
  const headTrace = points.slice(tipIndex + 1);
  const fallback = headTrace.at(-1) ?? tip;
  if (headTrace.length < 6 || shaftLength <= epsilon) {
    return {
      confidence: 0,
      diagnostics: { topologyPenalty: 1 },
      fitError: 20,
      geometry: {
        headLeft: fallback,
        headRight: fallback,
        kind: "arrow",
        start,
        tip,
      },
      kind: "arrow",
    };
  }

  let firstWingIndex = 0;
  let firstWingLength = 0;
  for (let index = 0; index < headTrace.length - 2; index += 1) {
    const length = distance(tip, headTrace[index]!);
    if (length > firstWingLength) {
      firstWingLength = length;
      firstWingIndex = index;
    }
  }
  const minimumReturnIndex = Math.min(
    headTrace.length - 2,
    firstWingIndex + Math.max(2, Math.floor(headTrace.length * 0.08)),
  );
  let returnIndex = minimumReturnIndex;
  let returnDistance = Number.POSITIVE_INFINITY;
  for (
    let index = minimumReturnIndex;
    index < headTrace.length - 1;
    index += 1
  ) {
    const candidate = distance(tip, headTrace[index]!);
    if (candidate < returnDistance) {
      returnDistance = candidate;
      returnIndex = index;
    }
  }
  let secondWingIndex = returnIndex + 1;
  let secondWingLength = 0;
  for (let index = returnIndex + 1; index < headTrace.length; index += 1) {
    const length = distance(tip, headTrace[index]!);
    if (length > secondWingLength) {
      secondWingLength = length;
      secondWingIndex = index;
    }
  }

  const headLeft = headTrace[firstWingIndex] ?? fallback;
  const headRight = headTrace[secondWingIndex] ?? fallback;
  const shaft = { x: tip.x - start.x, y: tip.y - start.y };
  const left = { x: headLeft.x - tip.x, y: headLeft.y - tip.y };
  const right = { x: headRight.x - tip.x, y: headRight.y - tip.y };
  const diagonal = Math.max(
    epsilon,
    Math.hypot(
      Math.max(...points.map(({ x }) => x)) -
        Math.min(...points.map(({ x }) => x)),
      Math.max(...points.map(({ y }) => y)) -
        Math.min(...points.map(({ y }) => y)),
    ),
  );
  const shaftResidual =
    rms(points.slice(0, tipIndex + 1), [[start, tip]]) / diagonal;
  const headResidual =
    rms(headTrace, [
      [tip, headLeft],
      [tip, headRight],
    ]) / diagonal;
  const leftRatio = firstWingLength / shaftLength;
  const rightRatio = secondWingLength / shaftLength;
  const symmetry =
    Math.min(firstWingLength, secondWingLength) /
    Math.max(epsilon, Math.max(firstWingLength, secondWingLength));
  const returnRatio = returnDistance / shaftLength;
  const backwardLeft =
    -dot(shaft, left) / Math.max(epsilon, shaftLength * firstWingLength);
  const backwardRight =
    -dot(shaft, right) / Math.max(epsilon, shaftLength * secondWingLength);
  const oppositeSides = cross(shaft, left) * cross(shaft, right) < 0;
  const loss =
    shaftResidual * 14 +
    headResidual * 12 +
    Math.max(0, returnRatio - 0.16) * 16 +
    Math.max(0, 0.12 - leftRatio) * 12 +
    Math.max(0, leftRatio - 0.46) * 10 +
    Math.max(0, 0.12 - rightRatio) * 12 +
    Math.max(0, rightRatio - 0.46) * 10 +
    Math.max(0, 0.52 - backwardLeft) * 7 +
    Math.max(0, 0.52 - backwardRight) * 7 +
    Math.max(0, 0.64 - symmetry) * 5 +
    (oppositeSides ? 0 : 4);
  return {
    confidence: round(Math.exp(-loss)),
    diagnostics: {
      backwardLeft: round(backwardLeft),
      backwardRight: round(backwardRight),
      headResidual: round(headResidual),
      leftWingRatio: round(leftRatio),
      returnRatio: round(returnRatio),
      rightWingRatio: round(rightRatio),
      shaftResidual: round(shaftResidual),
      wingSymmetry: round(symmetry),
    },
    fitError: round(loss),
    geometry: { headLeft, headRight, kind: "arrow", start, tip },
    kind: "arrow",
  };
}

function fitContinuousDirection(
  points: readonly Vec2[],
): SmartInkArrowCandidate {
  const start = points[0]!;
  let tipIndex = Math.floor(points.length * 0.3);
  let shaftLength = 0;
  for (
    let index = tipIndex;
    index <= Math.ceil(points.length * 0.8);
    index += 1
  ) {
    const length = distance(start, points[index]!);
    if (length > shaftLength) {
      shaftLength = length;
      tipIndex = index;
    }
  }
  const tip = points[tipIndex]!;
  const headTrace = points.slice(tipIndex + 1);
  const fallback = headTrace.at(-1) ?? tip;
  if (headTrace.length < 7 || shaftLength <= epsilon) {
    return {
      confidence: 0,
      diagnostics: { continuousTopologyPenalty: 1 },
      fitError: 20,
      geometry: {
        headLeft: fallback,
        headRight: fallback,
        kind: "arrow",
        start,
        tip,
      },
      kind: "arrow",
    };
  }
  let firstWingIndex = 0;
  let firstWingLength = 0;
  for (let index = 0; index < Math.floor(headTrace.length * 0.72); index += 1) {
    const length = distance(tip, headTrace[index]!);
    if (length > firstWingLength) {
      firstWingLength = length;
      firstWingIndex = index;
    }
  }
  const headLeft = headTrace[firstWingIndex] ?? fallback;
  const headRight = fallback;
  const secondWingLength = distance(tip, fallback);
  const shaft = subtractVector(tip, start);
  const left = subtractVector(headLeft, tip);
  const right = subtractVector(headRight, tip);
  const diagonal = Math.max(
    epsilon,
    Math.hypot(
      Math.max(...points.map(({ x }) => x)) -
        Math.min(...points.map(({ x }) => x)),
      Math.max(...points.map(({ y }) => y)) -
        Math.min(...points.map(({ y }) => y)),
    ),
  );
  const shaftResidual =
    rms(points.slice(0, tipIndex + 1), [[start, tip]]) / diagonal;
  const headResidual =
    rms(headTrace, [
      [tip, headLeft],
      [headLeft, headRight],
    ]) / diagonal;
  const leftRatio = firstWingLength / shaftLength;
  const rightRatio = secondWingLength / shaftLength;
  const backwardLeft =
    -dot(shaft, left) / Math.max(epsilon, shaftLength * firstWingLength);
  const backwardRight =
    -dot(shaft, right) / Math.max(epsilon, shaftLength * secondWingLength);
  const oppositeSides = cross(shaft, left) * cross(shaft, right) < 0;
  const plausibleWingLengths = leftRatio >= 0.12 && rightRatio >= 0.12;
  const loss =
    shaftResidual * 10 +
    headResidual * 11 +
    Math.max(0, 0.12 - leftRatio) * 12 +
    Math.max(0, leftRatio - 0.62) * 8 +
    Math.max(0, 0.12 - rightRatio) * 12 +
    Math.max(0, rightRatio - 0.62) * 8 +
    Math.max(0, 0.42 - backwardLeft) * 7 +
    Math.max(0, 0.42 - backwardRight) * 7 +
    (oppositeSides ? 0 : 4) +
    (plausibleWingLengths ? 0 : 4);
  return {
    confidence: round(Math.exp(-loss)),
    diagnostics: {
      backwardLeft: round(backwardLeft),
      backwardRight: round(backwardRight),
      continuousTopology: 1,
      headResidual: round(headResidual),
      leftWingRatio: round(leftRatio),
      rightWingRatio: round(rightRatio),
      shaftResidual: round(shaftResidual),
    },
    fitError: round(loss),
    geometry: { headLeft, headRight, kind: "arrow", start, tip },
    kind: "arrow",
  };
}

function subtractVector(left: Vec2, right: Vec2): Vec2 {
  return { x: left.x - right.x, y: left.y - right.y };
}

export function recognizeSmartInkArrow(
  input: readonly Vec2[],
): SmartInkArrowProposal {
  if (
    input.length < 5 ||
    input.length > 16_384 ||
    input.some(({ x, y }) => !Number.isFinite(x) || !Number.isFinite(y))
  ) {
    return {
      candidate: null,
      diagnostics: ["invalid-or-empty-stroke"],
      recognizerVersion: smartInkArrowRecognizerVersion,
      sampledPointCount: 0,
      status: "unrecognized",
    };
  }
  const points = resample(input);
  const reversePoints = [...points].reverse();
  const candidate = [
    fitDirection(points),
    fitContinuousDirection(points),
    fitDirection(reversePoints),
    fitContinuousDirection(reversePoints),
  ].sort((left, right) => right.confidence - left.confidence)[0]!;
  return {
    candidate: candidate.confidence >= minimumConfidence ? candidate : null,
    diagnostics:
      candidate.confidence >= minimumConfidence
        ? []
        : ["confidence-below-threshold"],
    recognizerVersion: smartInkArrowRecognizerVersion,
    sampledPointCount: points.length,
    status:
      candidate.confidence >= minimumConfidence ? "recognized" : "unrecognized",
  };
}
