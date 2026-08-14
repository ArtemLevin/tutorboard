import type { Vec2 } from "../../../core/public";
import type { SmartInkProposal } from "../../smart-ink-spike/public";
import type { SmartInkTrace, SmartInkV2Features } from "./types";

const epsilon = 1e-9;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function distance(left: Vec2, right: Vec2): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function pathLength(points: readonly Vec2[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += distance(points[index - 1]!, points[index]!);
  }
  return total;
}

function bounds(points: readonly Vec2[]) {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  const width = Math.max(epsilon, maxX - minX);
  const height = Math.max(epsilon, maxY - minY);
  return { diagonal: Math.hypot(width, height), height, width };
}

function coefficientOfVariation(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean <= epsilon) return 0;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

function orientation(a: Vec2, b: Vec2, c: Vec2): number {
  return (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
}

function intersects(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

function selfIntersectionCount(points: readonly Vec2[]): number {
  let count = 0;
  const stride = Math.max(1, Math.floor(points.length / 96));
  for (let first = stride; first < points.length; first += stride) {
    const a = points[first - stride]!;
    const b = points[first]!;
    for (
      let second = first + stride * 2;
      second < points.length;
      second += stride
    ) {
      if (first === stride && second >= points.length - stride) continue;
      const c = points[second - stride]!;
      const d = points[second]!;
      if (intersects(a, b, c, d)) count += 1;
      if (count >= 8) return count;
    }
  }
  return count;
}

function retracingRatio(points: readonly Vec2[], diagonal: number): number {
  if (points.length < 6 || diagonal <= epsilon) return 0;
  const tolerance = diagonal * 0.035;
  let retraced = 0;
  let compared = 0;
  const stride = Math.max(1, Math.floor(points.length / 128));
  for (let index = stride * 4; index < points.length; index += stride) {
    const point = points[index]!;
    compared += 1;
    for (let previous = 0; previous < index - stride * 3; previous += stride) {
      if (distance(point, points[previous]!) <= tolerance) {
        retraced += 1;
        break;
      }
    }
  }
  return compared === 0 ? 0 : clamp01(retraced / compared);
}

function diagnostic(
  proposal: SmartInkProposal,
  name: string,
  fallback = 0,
): number {
  for (const candidate of proposal.candidates) {
    const value = candidate.diagnostics[name];
    if (value !== undefined) return value;
  }
  return fallback;
}

export function extractSmartInkV2Features(
  trace: SmartInkTrace,
  proposal: SmartInkProposal,
): SmartInkV2Features {
  const points = trace.points;
  const box = bounds(points);
  const length = pathLength(points);
  const endpoints =
    points.length < 2 ? 0 : distance(points[0]!, points.at(-1)!);
  const speeds: number[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const elapsed = Math.max(
      1,
      points[index]!.timestampMs - points[index - 1]!.timestampMs,
    );
    speeds.push(distance(points[index - 1]!, points[index]!) / elapsed);
  }
  const pressures = points.map(({ pressure }) => pressure);
  return {
    aspectRatio:
      Math.min(box.width, box.height) / Math.max(box.width, box.height),
    closure: clamp01(1 - endpoints / Math.max(epsilon, box.diagonal * 0.25)),
    cornerConcentration: diagnostic(proposal, "cornerConcentration"),
    endpointEfficiency: length <= epsilon ? 0 : endpoints / length,
    meanPressure:
      pressures.length === 0
        ? 0.5
        : pressures.reduce((sum, value) => sum + value, 0) / pressures.length,
    pathToDiagonal: length / Math.max(epsilon, box.diagonal),
    pressureVariation: coefficientOfVariation(pressures),
    retracing: retracingRatio(points, box.diagonal),
    selfIntersections: selfIntersectionCount(points),
    speedVariation: coefficientOfVariation(speeds),
    turningConsistency: diagnostic(proposal, "turningConsistency"),
  };
}
