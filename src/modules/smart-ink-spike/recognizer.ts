import type { Vec2 } from "../../core/public";

import type {
  FittedCircle,
  FittedEllipse,
  FittedLine,
  FittedPolygon,
  SmartInkCandidate,
  SmartInkFittedGeometry,
  SmartInkPrimitiveKind,
  SmartInkProposal,
  SmartInkRecognizerOptions,
} from "./types";

const recognizerVersion = "tutorboard.smart-ink-geometric/0.1-spike";
const proposalSchemaVersion = "tutorboard.smart-ink-proposal/0.1-spike";
const epsilon = 1e-9;
const maximumInputPointCount = 16_384;
const maximumSampleCount = 512;
const minimumSampleCount = 8;

interface StrokeAnalysis {
  readonly axisRatio: number;
  readonly closedness: number;
  readonly diagonal: number;
  readonly points: readonly Vec2[];
}

interface FitResult<TGeometry extends SmartInkFittedGeometry> {
  readonly diagnostics: Readonly<Record<string, number>>;
  readonly geometry: TGeometry;
  readonly loss: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function roundMetric(value: number): number {
  return Number(value.toFixed(6));
}

function distance(left: Vec2, right: Vec2): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function squaredDistance(left: Vec2, right: Vec2): number {
  const deltaX = right.x - left.x;
  const deltaY = right.y - left.y;
  return deltaX * deltaX + deltaY * deltaY;
}

function totalLength(points: readonly Vec2[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    length += distance(points[index - 1]!, points[index]!);
  }
  return length;
}

function deduplicate(points: readonly Vec2[]): readonly Vec2[] {
  const result: Vec2[] = [];
  for (const point of points) {
    const previous = result.at(-1);
    if (previous === undefined || squaredDistance(previous, point) > epsilon) {
      result.push(point);
    }
  }
  return result;
}

function resample(
  input: readonly Vec2[],
  requestedCount: number,
): readonly Vec2[] {
  const points = deduplicate(input);
  const length = totalLength(points);
  if (points.length < 2 || length <= epsilon) {
    return points;
  }

  const count = Math.max(8, Math.floor(requestedCount));
  const step = length / (count - 1);
  const result: Vec2[] = [{ ...points[0]! }];
  let segmentIndex = 1;
  let segmentStart = points[0]!;
  let segmentEnd = points[1]!;
  let segmentStartDistance = 0;
  let segmentLength = distance(segmentStart, segmentEnd);

  for (let sampleIndex = 1; sampleIndex < count - 1; sampleIndex += 1) {
    const targetDistance = sampleIndex * step;
    while (
      segmentIndex < points.length - 1 &&
      segmentStartDistance + segmentLength < targetDistance
    ) {
      segmentStartDistance += segmentLength;
      segmentIndex += 1;
      segmentStart = points[segmentIndex - 1]!;
      segmentEnd = points[segmentIndex]!;
      segmentLength = distance(segmentStart, segmentEnd);
    }
    const ratio =
      segmentLength <= epsilon
        ? 0
        : clamp01((targetDistance - segmentStartDistance) / segmentLength);
    result.push({
      x: segmentStart.x + (segmentEnd.x - segmentStart.x) * ratio,
      y: segmentStart.y + (segmentEnd.y - segmentStart.y) * ratio,
    });
  }

  result.push({ ...points.at(-1)! });
  return result;
}

function bounds(points: readonly Vec2[]) {
  let minimumX = Number.POSITIVE_INFINITY;
  let minimumY = Number.POSITIVE_INFINITY;
  let maximumX = Number.NEGATIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    minimumX = Math.min(minimumX, point.x);
    minimumY = Math.min(minimumY, point.y);
    maximumX = Math.max(maximumX, point.x);
    maximumY = Math.max(maximumY, point.y);
  }
  return {
    diagonal: Math.hypot(maximumX - minimumX, maximumY - minimumY),
    maximumX,
    maximumY,
    minimumX,
    minimumY,
  };
}

function centroid(points: readonly Vec2[]): Vec2 {
  const sum = points.reduce(
    (current, point) => ({
      x: current.x + point.x,
      y: current.y + point.y,
    }),
    { x: 0, y: 0 },
  );
  return { x: sum.x / points.length, y: sum.y / points.length };
}

function principalAxis(points: readonly Vec2[]) {
  const center = centroid(points);
  let xx = 0;
  let xy = 0;
  let yy = 0;
  for (const point of points) {
    const x = point.x - center.x;
    const y = point.y - center.y;
    xx += x * x;
    xy += x * y;
    yy += y * y;
  }
  xx /= points.length;
  xy /= points.length;
  yy /= points.length;

  const trace = xx + yy;
  const discriminant = Math.sqrt(Math.max(0, (xx - yy) ** 2 + 4 * xy ** 2));
  const majorEigenvalue = Math.max(epsilon, (trace + discriminant) / 2);
  const minorEigenvalue = Math.max(epsilon, (trace - discriminant) / 2);
  const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
  return {
    angle,
    axis: { x: Math.cos(angle), y: Math.sin(angle) },
    axisRatio: Math.sqrt(minorEigenvalue / majorEigenvalue),
    center,
  };
}

function rotate(point: Vec2, angle: number): Vec2 {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return {
    x: point.x * cosine - point.y * sine,
    y: point.x * sine + point.y * cosine,
  };
}

function pointToSegmentDistance(point: Vec2, start: Vec2, end: Vec2): number {
  const lengthSquared = squaredDistance(start, end);
  if (lengthSquared <= epsilon) {
    return distance(point, start);
  }
  const ratio = clamp01(
    ((point.x - start.x) * (end.x - start.x) +
      (point.y - start.y) * (end.y - start.y)) /
      lengthSquared,
  );
  return distance(point, {
    x: start.x + (end.x - start.x) * ratio,
    y: start.y + (end.y - start.y) * ratio,
  });
}

function polylineRootMeanSquareError(
  points: readonly Vec2[],
  vertices: readonly Vec2[],
  closed: boolean,
): number {
  let sum = 0;
  const segmentCount = closed ? vertices.length : vertices.length - 1;
  for (const point of points) {
    let nearest = Number.POSITIVE_INFINITY;
    for (let index = 0; index < segmentCount; index += 1) {
      nearest = Math.min(
        nearest,
        pointToSegmentDistance(
          point,
          vertices[index]!,
          vertices[(index + 1) % vertices.length]!,
        ),
      );
    }
    sum += nearest * nearest;
  }
  return Math.sqrt(sum / points.length);
}

function convexHull(points: readonly Vec2[]): readonly Vec2[] {
  const sorted = [...points].sort((left, right) =>
    left.x === right.x ? left.y - right.y : left.x - right.x,
  );
  const cross = (origin: Vec2, left: Vec2, right: Vec2) =>
    (left.x - origin.x) * (right.y - origin.y) -
    (left.y - origin.y) * (right.x - origin.x);
  const half: Vec2[] = [];
  const append = (point: Vec2) => {
    while (half.length >= 2 && cross(half.at(-2)!, half.at(-1)!, point) <= 0) {
      half.pop();
    }
    half.push(point);
  };
  for (const point of sorted) {
    append(point);
  }
  const lowerLength = half.length;
  for (let index = sorted.length - 2; index > 0; index -= 1) {
    append(sorted[index]!);
  }
  if (half.length > lowerLength) {
    half.pop();
  }
  return half;
}

function fitLine(analysis: StrokeAnalysis): FitResult<FittedLine> {
  const principal = principalAxis(analysis.points);
  let minimumProjection = Number.POSITIVE_INFINITY;
  let maximumProjection = Number.NEGATIVE_INFINITY;
  for (const point of analysis.points) {
    const projection =
      (point.x - principal.center.x) * principal.axis.x +
      (point.y - principal.center.y) * principal.axis.y;
    minimumProjection = Math.min(minimumProjection, projection);
    maximumProjection = Math.max(maximumProjection, projection);
  }
  const start = {
    x: principal.center.x + principal.axis.x * minimumProjection,
    y: principal.center.y + principal.axis.y * minimumProjection,
  };
  const end = {
    x: principal.center.x + principal.axis.x * maximumProjection,
    y: principal.center.y + principal.axis.y * maximumProjection,
  };
  const normalizedError =
    polylineRootMeanSquareError(analysis.points, [start, end], false) /
    analysis.diagonal;
  const loss = normalizedError * 14 + analysis.closedness * 2.5;
  return {
    diagnostics: {
      closedness: roundMetric(analysis.closedness),
      normalizedResidual: roundMetric(normalizedError),
    },
    geometry: { end, kind: "line", start },
    loss,
  };
}

function fitCircle(analysis: StrokeAnalysis): FitResult<FittedCircle> {
  const center = centroid(analysis.points);
  const distances = analysis.points.map((point) => distance(point, center));
  const radius =
    distances.reduce((sum, value) => sum + value, 0) / distances.length;
  const radialError =
    Math.sqrt(
      distances.reduce((sum, value) => sum + (value - radius) ** 2, 0) /
        distances.length,
    ) / Math.max(radius, epsilon);
  const anisotropyPenalty = Math.max(0, 0.9 - analysis.axisRatio) * 4;
  const loss =
    radialError * 7 + anisotropyPenalty + (1 - analysis.closedness) * 2.5;
  return {
    diagnostics: {
      axisRatio: roundMetric(analysis.axisRatio),
      closedness: roundMetric(analysis.closedness),
      radialResidual: roundMetric(radialError),
    },
    geometry: { center, kind: "circle", radius },
    loss,
  };
}

function fitEllipse(analysis: StrokeAnalysis): FitResult<FittedEllipse> {
  const principal = principalAxis(analysis.points);
  const local = analysis.points.map((point) =>
    rotate(
      { x: point.x - principal.center.x, y: point.y - principal.center.y },
      -principal.angle,
    ),
  );
  const localBounds = bounds(local);
  const localCenter = {
    x: (localBounds.minimumX + localBounds.maximumX) / 2,
    y: (localBounds.minimumY + localBounds.maximumY) / 2,
  };
  const radius = {
    x: Math.max(epsilon, (localBounds.maximumX - localBounds.minimumX) / 2),
    y: Math.max(epsilon, (localBounds.maximumY - localBounds.minimumY) / 2),
  };
  const worldCenterOffset = rotate(localCenter, principal.angle);
  const center = {
    x: principal.center.x + worldCenterOffset.x,
    y: principal.center.y + worldCenterOffset.y,
  };
  const radialError = Math.sqrt(
    local.reduce((sum, point) => {
      const normalizedRadius = Math.hypot(
        (point.x - localCenter.x) / radius.x,
        (point.y - localCenter.y) / radius.y,
      );
      return sum + (normalizedRadius - 1) ** 2;
    }, 0) / local.length,
  );
  const circularPenalty = Math.max(0, analysis.axisRatio - 0.88) * 3;
  const loss =
    radialError * 7 + circularPenalty + (1 - analysis.closedness) * 2.5;
  return {
    diagnostics: {
      axisRatio: roundMetric(analysis.axisRatio),
      closedness: roundMetric(analysis.closedness),
      radialResidual: roundMetric(radialError),
    },
    geometry: {
      center,
      kind: "ellipse",
      radius,
      rotation: principal.angle,
    },
    loss,
  };
}

function orientedRectangle(points: readonly Vec2[]) {
  const hull = convexHull(points);
  let best:
    | {
        readonly angle: number;
        readonly area: number;
        readonly maximumX: number;
        readonly maximumY: number;
        readonly minimumX: number;
        readonly minimumY: number;
      }
    | undefined;
  for (let index = 0; index < hull.length; index += 1) {
    const start = hull[index]!;
    const end = hull[(index + 1) % hull.length]!;
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const localBounds = bounds(points.map((point) => rotate(point, -angle)));
    const area =
      (localBounds.maximumX - localBounds.minimumX) *
      (localBounds.maximumY - localBounds.minimumY);
    if (best === undefined || area < best.area) {
      best = { ...localBounds, angle, area };
    }
  }
  if (best === undefined) {
    throw new Error("Cannot fit an oriented rectangle to an empty hull.");
  }
  const localVertices = [
    { x: best.minimumX, y: best.minimumY },
    { x: best.maximumX, y: best.minimumY },
    { x: best.maximumX, y: best.maximumY },
    { x: best.minimumX, y: best.maximumY },
  ];
  return {
    aspectRatio:
      Math.max(best.maximumX - best.minimumX, best.maximumY - best.minimumY) /
      Math.max(
        epsilon,
        Math.min(best.maximumX - best.minimumX, best.maximumY - best.minimumY),
      ),
    vertices: localVertices.map((point) => rotate(point, best.angle)),
  };
}

function fitQuadrilateral(
  analysis: StrokeAnalysis,
  kind: "rectangle" | "square",
): FitResult<FittedPolygon> {
  const fitted = orientedRectangle(analysis.points);
  const normalizedError =
    polylineRootMeanSquareError(analysis.points, fitted.vertices, true) /
    analysis.diagonal;
  const squareDeviation = Math.abs(Math.log(fitted.aspectRatio));
  const specializationPenalty =
    kind === "square"
      ? squareDeviation * 3
      : Math.max(0, 1.18 - fitted.aspectRatio) * 2.5;
  const loss =
    normalizedError * 12 +
    specializationPenalty +
    (1 - analysis.closedness) * 2.5;
  return {
    diagnostics: {
      aspectRatio: roundMetric(fitted.aspectRatio),
      closedness: roundMetric(analysis.closedness),
      normalizedResidual: roundMetric(normalizedError),
    },
    geometry: { kind, vertices: fitted.vertices },
    loss,
  };
}

function triangleArea(left: Vec2, middle: Vec2, right: Vec2): number {
  return Math.abs(
    (middle.x - left.x) * (right.y - left.y) -
      (middle.y - left.y) * (right.x - left.x),
  );
}

function fitTriangle(analysis: StrokeAnalysis): FitResult<FittedPolygon> {
  const hull = convexHull(analysis.points);
  let maximumArea = Number.NEGATIVE_INFINITY;
  let vertices: readonly Vec2[] = [
    analysis.points[0]!,
    analysis.points[Math.floor(analysis.points.length / 3)]!,
    analysis.points[Math.floor((analysis.points.length * 2) / 3)]!,
  ];
  for (let first = 0; first < hull.length - 2; first += 1) {
    for (let second = first + 1; second < hull.length - 1; second += 1) {
      for (let third = second + 1; third < hull.length; third += 1) {
        const area = triangleArea(hull[first]!, hull[second]!, hull[third]!);
        if (area > maximumArea) {
          maximumArea = area;
          vertices = [hull[first]!, hull[second]!, hull[third]!];
        }
      }
    }
  }
  const normalizedError =
    polylineRootMeanSquareError(analysis.points, vertices, true) /
    analysis.diagonal;
  const loss = normalizedError * 12 + (1 - analysis.closedness) * 2.5;
  return {
    diagnostics: {
      closedness: roundMetric(analysis.closedness),
      normalizedResidual: roundMetric(normalizedError),
    },
    geometry: { kind: "triangle", vertices },
    loss,
  };
}

function asCandidate(
  kind: SmartInkPrimitiveKind,
  fit: FitResult<SmartInkFittedGeometry>,
): SmartInkCandidate {
  return {
    confidence: roundMetric(Math.exp(-fit.loss)),
    diagnostics: fit.diagnostics,
    fitError: roundMetric(fit.loss),
    geometry: fit.geometry,
    kind,
  };
}

function unrecognized(
  sourceStrokeId: string,
  diagnostic: string,
): SmartInkProposal {
  return {
    candidates: [],
    diagnostics: [diagnostic],
    recognizerVersion,
    sampledPointCount: 0,
    schemaVersion: proposalSchemaVersion,
    sourceStrokeId,
    status: "unrecognized",
  };
}

export function recognizeSmartInkStroke(
  sourceStrokeId: string,
  input: readonly Vec2[],
  options: SmartInkRecognizerOptions = {},
): SmartInkProposal {
  const sampleCount = options.sampleCount ?? 96;
  const minimumConfidence = options.minimumConfidence ?? 0.58;
  const ambiguityMargin = options.ambiguityMargin ?? 0.08;
  if (
    !Number.isInteger(sampleCount) ||
    sampleCount < minimumSampleCount ||
    sampleCount > maximumSampleCount ||
    !Number.isFinite(minimumConfidence) ||
    minimumConfidence < 0 ||
    minimumConfidence > 1 ||
    !Number.isFinite(ambiguityMargin) ||
    ambiguityMargin < 0 ||
    ambiguityMargin > 1
  ) {
    return unrecognized(sourceStrokeId, "invalid-recognizer-options");
  }
  if (
    input.length < 2 ||
    input.some(
      (point) => !Number.isFinite(point.x) || !Number.isFinite(point.y),
    )
  ) {
    return unrecognized(sourceStrokeId, "invalid-or-empty-stroke");
  }
  if (input.length > maximumInputPointCount) {
    return unrecognized(sourceStrokeId, "stroke-point-limit-exceeded");
  }

  const points = resample(input, sampleCount);
  const strokeBounds = bounds(points);
  const strokeLength = totalLength(points);
  if (
    points.length < 2 ||
    !Number.isFinite(strokeBounds.diagonal) ||
    strokeBounds.diagonal <= epsilon ||
    !Number.isFinite(strokeLength) ||
    strokeLength <= epsilon
  ) {
    return unrecognized(sourceStrokeId, "degenerate-stroke");
  }

  const principal = principalAxis(points);
  const closureRatio =
    distance(points[0]!, points.at(-1)!) / strokeBounds.diagonal;
  const analysis: StrokeAnalysis = {
    axisRatio: principal.axisRatio,
    closedness: clamp01(1 - closureRatio / 0.22),
    diagonal: strokeBounds.diagonal,
    points,
  };
  const candidates = [
    asCandidate("line", fitLine(analysis)),
    asCandidate("circle", fitCircle(analysis)),
    asCandidate("ellipse", fitEllipse(analysis)),
    asCandidate("rectangle", fitQuadrilateral(analysis, "rectangle")),
    asCandidate("square", fitQuadrilateral(analysis, "square")),
    asCandidate("triangle", fitTriangle(analysis)),
  ].sort(
    (left, right) =>
      right.confidence - left.confidence || left.kind.localeCompare(right.kind),
  );

  const first = candidates[0]!;
  const second = candidates[1]!;
  const status =
    first.confidence < minimumConfidence
      ? "unrecognized"
      : first.confidence - second.confidence < ambiguityMargin
        ? "ambiguous"
        : "recognized";

  return {
    candidates,
    diagnostics:
      status === "ambiguous"
        ? [`ambiguous:${first.kind}:${second.kind}`]
        : status === "unrecognized"
          ? ["confidence-below-threshold"]
          : [],
    recognizerVersion,
    sampledPointCount: points.length,
    schemaVersion: proposalSchemaVersion,
    sourceStrokeId,
    status,
  };
}
