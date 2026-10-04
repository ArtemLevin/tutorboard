import type { Vec2 } from "./primitives";

export const vectorInkSchemaVersion = "1.0" as const;
export const defaultVectorInkPressure = 0.5;
export const legacyVectorInkSampleIntervalMs = 8;
export const maximumVectorInkSamples = 100_000;

export interface VectorInkSample {
  readonly point: Vec2;
  readonly pressure: number;
  readonly timestampMs: number;
}

export interface CubicBezierSegment {
  readonly control1: Vec2;
  readonly control2: Vec2;
  readonly end: Vec2;
  readonly start: Vec2;
}

export interface VectorInkData {
  readonly centerline: readonly CubicBezierSegment[];
  readonly closed: boolean;
  readonly samples: readonly VectorInkSample[];
  readonly version: typeof vectorInkSchemaVersion;
}

export interface VectorInkStrokeLike {
  readonly ink?: VectorInkData;
  readonly points: readonly Vec2[];
}

export interface VectorInkBounds {
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly top: number;
}

const epsilon = 0.001;
const minimumOutlinePressureMultiplier = 0.35;
const outlinePressureRange = 0.9;
const outlineCapSteps = 8;
const maximumBezierSubdivisions = 16;

function finitePoint(point: Vec2): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function clonePoint(point: Vec2): Vec2 {
  return { x: point.x, y: point.y };
}

function samePoint(left: Vec2, right: Vec2): boolean {
  return left.x === right.x && left.y === right.y;
}

function approximatelySamePoint(left: Vec2, right: Vec2): boolean {
  return Math.hypot(left.x - right.x, left.y - right.y) < epsilon;
}

function add(left: Vec2, right: Vec2): Vec2 {
  return { x: left.x + right.x, y: left.y + right.y };
}

function subtract(left: Vec2, right: Vec2): Vec2 {
  return { x: left.x - right.x, y: left.y - right.y };
}

function multiply(point: Vec2, factor: number): Vec2 {
  return { x: point.x * factor, y: point.y * factor };
}

function clampPressure(value: number): number {
  return Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : defaultVectorInkPressure;
}

function normalizeTimestamp(value: number, previous: number): number {
  if (!Number.isFinite(value) || value < previous) {
    return previous + legacyVectorInkSampleIntervalMs;
  }
  return Math.max(0, value);
}

export function vectorInkStrokeIsClosed(points: readonly Vec2[]): boolean {
  const first = points[0];
  const last = points.at(-1);
  return (
    first !== undefined &&
    last !== undefined &&
    points.length > 2 &&
    approximatelySamePoint(first, last)
  );
}

export function createLegacyVectorInkSamples(
  points: readonly Vec2[],
): readonly VectorInkSample[] {
  return points.slice(0, maximumVectorInkSamples).map((point, index) => ({
    point: clonePoint(point),
    pressure: defaultVectorInkPressure,
    timestampMs: index * legacyVectorInkSampleIntervalMs,
  }));
}

export function normalizeVectorInkSamples(
  samples: readonly VectorInkSample[],
): readonly VectorInkSample[] {
  const output: VectorInkSample[] = [];
  let previousTimestamp = -legacyVectorInkSampleIntervalMs;
  for (const sample of samples.slice(0, maximumVectorInkSamples)) {
    if (!finitePoint(sample.point)) continue;
    const timestampMs = normalizeTimestamp(
      sample.timestampMs,
      previousTimestamp,
    );
    output.push({
      point: clonePoint(sample.point),
      pressure: clampPressure(sample.pressure),
      timestampMs,
    });
    previousTimestamp = timestampMs;
  }
  return output;
}

function uniqueCenterlinePoints(
  points: readonly Vec2[],
  closed: boolean,
): readonly Vec2[] {
  if (
    closed &&
    points.length > 2 &&
    approximatelySamePoint(points[0]!, points.at(-1)!)
  ) {
    return points.slice(0, -1);
  }
  return points;
}

function cubicSegment(
  previous: Vec2,
  start: Vec2,
  end: Vec2,
  next: Vec2,
): CubicBezierSegment {
  return {
    start: clonePoint(start),
    control1: add(start, multiply(subtract(end, previous), 1 / 6)),
    control2: subtract(end, multiply(subtract(next, start), 1 / 6)),
    end: clonePoint(end),
  };
}

export function createCubicBezierCenterline(
  points: readonly Vec2[],
  closed = vectorInkStrokeIsClosed(points),
): readonly CubicBezierSegment[] {
  const source = uniqueCenterlinePoints(points, closed);
  if (source.length < 2) return [];
  const segments: CubicBezierSegment[] = [];
  if (closed) {
    for (let index = 0; index < source.length; index += 1) {
      const previous = source[(index - 1 + source.length) % source.length]!;
      const start = source[index]!;
      const end = source[(index + 1) % source.length]!;
      const next = source[(index + 2) % source.length]!;
      segments.push(cubicSegment(previous, start, end, next));
    }
    return segments;
  }
  for (let index = 0; index < source.length - 1; index += 1) {
    const previous = source[Math.max(0, index - 1)]!;
    const start = source[index]!;
    const end = source[index + 1]!;
    const next = source[Math.min(source.length - 1, index + 2)]!;
    segments.push(cubicSegment(previous, start, end, next));
  }
  return segments;
}

function linearCubicSegment(start: Vec2, end: Vec2): CubicBezierSegment {
  const delta = subtract(end, start);
  return {
    start: clonePoint(start),
    control1: add(start, multiply(delta, 1 / 3)),
    control2: add(start, multiply(delta, 2 / 3)),
    end: clonePoint(end),
  };
}

export function createLinearCubicBezierCenterline(
  points: readonly Vec2[],
  closed = vectorInkStrokeIsClosed(points),
): readonly CubicBezierSegment[] {
  const source = uniqueCenterlinePoints(points, closed);
  if (source.length < 2) return [];
  const segmentCount = closed ? source.length : source.length - 1;
  return Array.from({ length: segmentCount }, (_, index) =>
    linearCubicSegment(source[index]!, source[(index + 1) % source.length]!),
  );
}

export function createVectorInkData(
  samples: readonly VectorInkSample[],
  closed?: boolean,
): VectorInkData {
  const normalized = normalizeVectorInkSamples(samples);
  const points = normalized.map(({ point }) => point);
  const resolvedClosed = closed ?? vectorInkStrokeIsClosed(points);
  return {
    centerline: createCubicBezierCenterline(points, resolvedClosed),
    closed: resolvedClosed,
    samples: normalized,
    version: vectorInkSchemaVersion,
  };
}

export function createVectorInkDataFromPoints(
  points: readonly Vec2[],
): VectorInkData {
  return createVectorInkData(
    createLegacyVectorInkSamples(points),
    vectorInkStrokeIsClosed(points),
  );
}

export function createLinearVectorInkDataFromPoints(
  points: readonly Vec2[],
): VectorInkData {
  const samples = createLegacyVectorInkSamples(points);
  const closed = vectorInkStrokeIsClosed(points);
  return {
    centerline: createLinearCubicBezierCenterline(points, closed),
    closed,
    samples,
    version: vectorInkSchemaVersion,
  };
}

export function resolveVectorInkData(
  stroke: VectorInkStrokeLike,
): VectorInkData {
  return stroke.ink ?? createVectorInkDataFromPoints(stroke.points);
}

function number(value: number): string {
  const normalized = Math.round(value * 1_000_000) / 1_000_000;
  return String(Object.is(normalized, -0) ? 0 : normalized);
}

export function vectorInkCenterlinePathData(ink: VectorInkData): string {
  const first = ink.centerline[0];
  if (first === undefined) return "";
  const commands = [`M ${number(first.start.x)} ${number(first.start.y)}`];
  for (const segment of ink.centerline) {
    commands.push(
      `C ${number(segment.control1.x)} ${number(segment.control1.y)} ${number(segment.control2.x)} ${number(segment.control2.y)} ${number(segment.end.x)} ${number(segment.end.y)}`,
    );
  }
  if (ink.closed) commands.push("Z");
  return commands.join(" ");
}

function cubicPoint(segment: CubicBezierSegment, ratio: number): Vec2 {
  const inverse = 1 - ratio;
  const inverseSquared = inverse * inverse;
  const ratioSquared = ratio * ratio;
  return {
    x:
      inverseSquared * inverse * segment.start.x +
      3 * inverseSquared * ratio * segment.control1.x +
      3 * inverse * ratioSquared * segment.control2.x +
      ratioSquared * ratio * segment.end.x,
    y:
      inverseSquared * inverse * segment.start.y +
      3 * inverseSquared * ratio * segment.control1.y +
      3 * inverse * ratioSquared * segment.control2.y +
      ratioSquared * ratio * segment.end.y,
  };
}

function segmentLengthEstimate(segment: CubicBezierSegment): number {
  return (
    Math.hypot(
      segment.control1.x - segment.start.x,
      segment.control1.y - segment.start.y,
    ) +
    Math.hypot(
      segment.control2.x - segment.control1.x,
      segment.control2.y - segment.control1.y,
    ) +
    Math.hypot(
      segment.end.x - segment.control2.x,
      segment.end.y - segment.control2.y,
    )
  );
}

interface OutlinePoint {
  readonly point: Vec2;
  readonly pressure: number;
}

function centerlineOutlinePoints(ink: VectorInkData): readonly OutlinePoint[] {
  if (ink.centerline.length === 0 || ink.samples.length < 2) return [];
  const sourceSamples =
    ink.closed &&
    approximatelySamePoint(ink.samples[0]!.point, ink.samples.at(-1)!.point)
      ? ink.samples.slice(0, -1)
      : ink.samples;
  const output: OutlinePoint[] = [];
  for (let index = 0; index < ink.centerline.length; index += 1) {
    const segment = ink.centerline[index]!;
    const startSample = sourceSamples[index % sourceSamples.length]!;
    const endSample = sourceSamples[(index + 1) % sourceSamples.length]!;
    const subdivisions = Math.min(
      maximumBezierSubdivisions,
      Math.max(3, Math.ceil(segmentLengthEstimate(segment) / 8)),
    );
    for (let step = index === 0 ? 0 : 1; step <= subdivisions; step += 1) {
      const ratio = step / subdivisions;
      output.push({
        point: cubicPoint(segment, ratio),
        pressure:
          startSample.pressure +
          (endSample.pressure - startSample.pressure) * ratio,
      });
    }
  }
  if (ink.closed && output.length > 1) {
    const first = output[0]!;
    const last = output.at(-1)!;
    if (approximatelySamePoint(first.point, last.point))
      return output.slice(0, -1);
  }
  return output;
}

function unitTangent(
  points: readonly OutlinePoint[],
  index: number,
  closed: boolean,
): Vec2 {
  const previous =
    points[index === 0 ? (closed ? points.length - 1 : 0) : index - 1]!.point;
  const next =
    points[
      index === points.length - 1 ? (closed ? 0 : points.length - 1) : index + 1
    ]!.point;
  const delta = subtract(next, previous);
  const length = Math.hypot(delta.x, delta.y);
  return length < 1e-9 ? { x: 1, y: 0 } : multiply(delta, 1 / length);
}

function halfWidth(baseWidth: number, pressure: number): number {
  return (
    (Math.max(0, baseWidth) *
      (minimumOutlinePressureMultiplier +
        outlinePressureRange * clampPressure(pressure))) /
    2
  );
}

function capPoints(
  center: Vec2,
  tangent: Vec2,
  radius: number,
  fromLeft: boolean,
): readonly Vec2[] {
  const normalAngle = Math.atan2(tangent.x, -tangent.y);
  const startAngle = fromLeft ? normalAngle : normalAngle + Math.PI;
  const direction = fromLeft ? 1 : 1;
  return Array.from({ length: outlineCapSteps + 1 }, (_, index) => {
    const angle =
      startAngle + (direction * (Math.PI * index)) / outlineCapSteps;
    return {
      x: center.x + Math.cos(angle) * radius,
      y: center.y + Math.sin(angle) * radius,
    };
  });
}

function boundsFromPoints(points: readonly Vec2[]): VectorInkBounds | null {
  if (points.length === 0) return null;
  let left = points[0]!.x;
  let right = left;
  let top = points[0]!.y;
  let bottom = top;
  for (const point of points.slice(1)) {
    left = Math.min(left, point.x);
    right = Math.max(right, point.x);
    top = Math.min(top, point.y);
    bottom = Math.max(bottom, point.y);
  }
  return { bottom, left, right, top };
}

function circleBounds(center: Vec2, radius: number): VectorInkBounds {
  return {
    bottom: center.y + radius,
    left: center.x - radius,
    right: center.x + radius,
    top: center.y - radius,
  };
}

interface StationaryInkCircle {
  readonly center: Vec2;
  readonly radius: number;
}

function stationaryInkCircle(
  ink: VectorInkData,
  strokeWidth: number,
): StationaryInkCircle | null {
  const firstSample = ink.samples[0];
  if (firstSample === undefined || strokeWidth <= 0) return null;
  const stationary =
    ink.samples.length === 1 ||
    ink.samples.every(({ point }) =>
      approximatelySamePoint(point, firstSample.point),
    );
  if (!stationary) return null;
  const pressure =
    ink.samples.reduce((sum, sample) => sum + sample.pressure, 0) /
    ink.samples.length;
  const radius = halfWidth(strokeWidth, pressure);
  return radius <= 0 ? null : { center: firstSample.point, radius };
}

function contourPathData(contour: readonly Vec2[]): string {
  const first = contour[0];
  if (first === undefined) return "";
  return [
    `M ${number(first.x)} ${number(first.y)}`,
    ...contour
      .slice(1)
      .map((point) => `L ${number(point.x)} ${number(point.y)}`),
    "Z",
  ].join(" ");
}

interface VectorInkOutlineGeometry {
  readonly bounds: VectorInkBounds | null;
  readonly pathData: string;
}

function vectorInkOutlineGeometry(
  ink: VectorInkData,
  strokeWidth: number,
): VectorInkOutlineGeometry {
  if (strokeWidth <= 0) return { bounds: null, pathData: "" };

  const circle = stationaryInkCircle(ink, strokeWidth);
  if (circle !== null) {
    const { x, y } = circle.center;
    const radius = circle.radius;
    return {
      bounds: circleBounds(circle.center, radius),
      pathData: [
        `M ${number(x + radius)} ${number(y)}`,
        `A ${number(radius)} ${number(radius)} 0 1 0 ${number(x - radius)} ${number(y)}`,
        `A ${number(radius)} ${number(radius)} 0 1 0 ${number(x + radius)} ${number(y)}`,
        "Z",
      ].join(" "),
    };
  }

  const center = centerlineOutlinePoints(ink);
  if (center.length < 2) return { bounds: null, pathData: "" };
  const left: Vec2[] = [];
  const right: Vec2[] = [];
  const tangents: Vec2[] = [];
  for (let index = 0; index < center.length; index += 1) {
    const tangent = unitTangent(center, index, ink.closed);
    tangents.push(tangent);
    const normal = { x: -tangent.y, y: tangent.x };
    const width = halfWidth(strokeWidth, center[index]!.pressure);
    left.push(add(center[index]!.point, multiply(normal, width)));
    right.push(subtract(center[index]!.point, multiply(normal, width)));
  }

  if (ink.closed) {
    const rightReversed = right.toReversed();
    return {
      bounds: boundsFromPoints([...left, ...rightReversed]),
      pathData: [contourPathData(left), contourPathData(rightReversed)]
        .filter((path) => path.length > 0)
        .join(" "),
    };
  }

  const outline: Vec2[] = [...left];
  outline.push(
    ...capPoints(
      center.at(-1)!.point,
      tangents.at(-1)!,
      halfWidth(strokeWidth, center.at(-1)!.pressure),
      true,
    ).slice(1),
  );
  outline.push(...right.toReversed());
  outline.push(
    ...capPoints(
      center[0]!.point,
      multiply(tangents[0]!, -1),
      halfWidth(strokeWidth, center[0]!.pressure),
      true,
    ).slice(1),
  );
  return {
    bounds: boundsFromPoints(outline),
    pathData: contourPathData(outline),
  };
}

export function vectorInkCenterlineBounds(
  ink: VectorInkData,
): VectorInkBounds | null {
  if (ink.centerline.length === 0) {
    return boundsFromPoints(ink.samples.map(({ point }) => point));
  }
  return boundsFromPoints(
    ink.centerline.flatMap((segment) => [
      segment.start,
      segment.control1,
      segment.control2,
      segment.end,
    ]),
  );
}

export function vectorInkOutlineBounds(
  ink: VectorInkData,
  strokeWidth: number,
): VectorInkBounds | null {
  return vectorInkOutlineGeometry(ink, strokeWidth).bounds;
}

export function vectorInkOutlinePathData(
  ink: VectorInkData,
  strokeWidth: number,
): string {
  return vectorInkOutlineGeometry(ink, strokeWidth).pathData;
}

export function vectorInkDataMatchesPoints(
  ink: VectorInkData,
  points: readonly Vec2[],
): boolean {
  if (
    ink.version !== vectorInkSchemaVersion ||
    ink.samples.length !== points.length ||
    ink.closed !== vectorInkStrokeIsClosed(points)
  ) {
    return false;
  }
  let previousTimestamp = -1;
  for (let index = 0; index < points.length; index += 1) {
    const sample = ink.samples[index]!;
    if (
      !samePoint(sample.point, points[index]!) ||
      !Number.isFinite(sample.pressure) ||
      sample.pressure < 0 ||
      sample.pressure > 1 ||
      !Number.isFinite(sample.timestampMs) ||
      sample.timestampMs < 0 ||
      sample.timestampMs < previousTimestamp
    ) {
      return false;
    }
    previousTimestamp = sample.timestampMs;
  }
  const smooth = createCubicBezierCenterline(points, ink.closed);
  const linear = createLinearCubicBezierCenterline(points, ink.closed);
  return (
    centerlineMatches(ink.centerline, smooth) ||
    centerlineMatches(ink.centerline, linear)
  );
}

function centerlineMatches(
  actual: readonly CubicBezierSegment[],
  expected: readonly CubicBezierSegment[],
): boolean {
  if (expected.length !== actual.length) return false;
  const fields = ["start", "control1", "control2", "end"] as const;
  for (let index = 0; index < expected.length; index += 1) {
    for (const field of fields) {
      const left = expected[index]![field];
      const right = actual[index]![field];
      if (
        Math.abs(left.x - right.x) > 1e-6 ||
        Math.abs(left.y - right.y) > 1e-6
      ) {
        return false;
      }
    }
  }
  return true;
}
