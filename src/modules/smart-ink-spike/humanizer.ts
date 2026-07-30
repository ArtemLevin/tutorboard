import type { Vec2 } from "../../core/public";

import type {
  SmartInkHumanizationOptions,
  SmartInkPrimitiveKind,
} from "./types";

const minimumPointCount = 16;
const maximumPointCount = 512;
const fullTurn = Math.PI * 2;

interface RandomSource {
  next(): number;
  range(minimum: number, maximum: number): number;
}

function createRandomSource(seed: number): RandomSource {
  if (!Number.isSafeInteger(seed)) {
    throw new Error("Smart Ink humanizer seed must be a safe integer.");
  }
  let state = seed >>> 0;
  const next = () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
  return {
    next,
    range: (minimum, maximum) => minimum + next() * (maximum - minimum),
  };
}

function assertPositiveDimension(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0 || value > 10_000) {
    throw new Error(`Smart Ink humanizer ${name} is outside its safe range.`);
  }
  return value;
}

function resolvePointCount(value: number | undefined): number {
  const pointCount = value ?? 96;
  if (
    !Number.isSafeInteger(pointCount) ||
    pointCount < minimumPointCount ||
    pointCount > maximumPointCount
  ) {
    throw new Error(
      `Smart Ink humanizer pointCount must be ${minimumPointCount}-${maximumPointCount}.`,
    );
  }
  return pointCount;
}

function wrapProgress(progress: number): number {
  return ((progress % 1) + 1) % 1;
}

function interpolatePolygon(vertices: readonly Vec2[], progress: number): Vec2 {
  const wrapped = wrapProgress(progress);
  const scaled = wrapped * vertices.length;
  const edge = Math.min(vertices.length - 1, Math.floor(scaled));
  const localProgress = scaled - edge;
  const start = vertices[edge]!;
  const end = vertices[(edge + 1) % vertices.length]!;
  return {
    x: start.x + (end.x - start.x) * localProgress,
    y: start.y + (end.y - start.y) * localProgress,
  };
}

function idealPointAt(
  kind: SmartInkPrimitiveKind,
  progress: number,
  width: number,
  height: number,
): Vec2 {
  if (kind === "line") {
    const bounded = Math.max(0, Math.min(1, progress));
    return { x: (bounded - 0.5) * width, y: 0 };
  }

  if (kind === "circle" || kind === "ellipse") {
    const angle = wrapProgress(progress) * fullTurn;
    return {
      x: Math.cos(angle) * width * 0.5,
      y: Math.sin(angle) * height * 0.5,
    };
  }

  if (kind === "triangle") {
    return interpolatePolygon(
      [
        { x: 0, y: -height * 0.54 },
        { x: width * 0.52, y: height * 0.46 },
        { x: -width * 0.48, y: height * 0.5 },
      ],
      progress,
    );
  }

  return interpolatePolygon(
    [
      { x: -width * 0.5, y: -height * 0.5 },
      { x: width * 0.5, y: -height * 0.5 },
      { x: width * 0.5, y: height * 0.5 },
      { x: -width * 0.5, y: height * 0.5 },
    ],
    progress,
  );
}

function resolveDimensions(
  kind: SmartInkPrimitiveKind,
  options: SmartInkHumanizationOptions,
): { height: number; width: number } {
  const defaultWidth = kind === "rectangle" ? 190 : 150;
  const defaultHeight = kind === "line" ? 70 : kind === "ellipse" ? 92 : 150;
  let width = assertPositiveDimension(options.width ?? defaultWidth, "width");
  let height = assertPositiveDimension(
    options.height ?? defaultHeight,
    "height",
  );

  if (kind === "circle" || kind === "square") {
    const side = Math.min(width, height);
    width = side;
    height = side;
  }
  return { height, width };
}

function normalized(vector: Vec2): Vec2 {
  const length = Math.hypot(vector.x, vector.y);
  if (length <= Number.EPSILON) {
    return { x: 1, y: 0 };
  }
  return { x: vector.x / length, y: vector.y / length };
}

function rotate(point: Vec2, angle: number): Vec2 {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return {
    x: point.x * cosine - point.y * sine,
    y: point.x * sine + point.y * cosine,
  };
}

export function humanizeSmartInkPrimitive(
  kind: SmartInkPrimitiveKind,
  options: SmartInkHumanizationOptions,
): readonly Vec2[] {
  const random = createRandomSource(options.seed);
  const pointCount = resolvePointCount(options.pointCount);
  const { height, width } = resolveDimensions(kind, options);
  const closed = kind !== "line";
  const referenceSize = Math.min(width, height);
  const requestedRotation = options.rotation;
  if (
    requestedRotation !== undefined &&
    (!Number.isFinite(requestedRotation) ||
      Math.abs(requestedRotation) > fullTurn * 100)
  ) {
    throw new Error("Smart Ink humanizer rotation is outside its safe range.");
  }

  const rotation = requestedRotation ?? random.range(-0.65, 0.65);
  const reverse = random.next() < 0.5;
  const direction = reverse ? -1 : 1;
  const startOffset = closed ? random.next() : reverse ? 1 : 0;
  const closureGap = closed ? random.range(0.002, 0.018) : 0;
  const speedAmplitude = random.range(0.08, 0.28);
  const speedPhase = random.range(0, fullTurn);
  const shearX = random.range(-0.055, 0.055);
  const scaleX = random.range(0.965, 1.035);
  const scaleY = random.range(0.965, 1.035);
  const globalOffset = {
    x: random.range(130, 210),
    y: random.range(90, 150),
  };
  const smoothNoise = Array.from({ length: 3 }, (_, index) => ({
    amplitude:
      referenceSize *
      random.range(index === 0 ? 0.007 : 0.003, index === 0 ? 0.02 : 0.011),
    frequency: index + 1,
    phase: random.range(0, fullTurn),
  }));
  const fineNoise = referenceSize * random.range(0.0015, 0.0045);

  return Array.from({ length: pointCount }, (_, index) => {
    const linearProgress = index / (pointCount - 1);
    const speedWarp =
      (speedAmplitude *
        (Math.sin(linearProgress * fullTurn + speedPhase) -
          Math.sin(speedPhase))) /
      fullTurn;
    const elapsed = Math.max(0, Math.min(1, linearProgress + speedWarp));
    const tracedProgress = elapsed * (1 - closureGap);
    const progress = closed
      ? startOffset + direction * tracedProgress
      : reverse
        ? 1 - elapsed
        : elapsed;
    const epsilon = 1 / Math.max(128, pointCount * 2);
    const point = idealPointAt(kind, progress, width, height);
    const before = idealPointAt(
      kind,
      closed ? progress - epsilon : Math.max(0, progress - epsilon),
      width,
      height,
    );
    const after = idealPointAt(
      kind,
      closed ? progress + epsilon : Math.min(1, progress + epsilon),
      width,
      height,
    );
    const tangent = normalized({
      x: after.x - before.x,
      y: after.y - before.y,
    });
    const normal = { x: -tangent.y, y: tangent.x };
    const normalOffset = smoothNoise.reduce(
      (sum, component) =>
        sum +
        component.amplitude *
          Math.sin(
            tracedProgress * fullTurn * component.frequency + component.phase,
          ),
      0,
    );
    const tangentialOffset =
      Math.sin(index * 12.9898 + options.seed * 0.017) * fineNoise;
    const local = {
      x:
        (point.x + normal.x * normalOffset + tangent.x * tangentialOffset) *
        scaleX,
      y:
        (point.y + normal.y * normalOffset + tangent.y * tangentialOffset) *
        scaleY,
    };
    const sheared = { x: local.x + local.y * shearX, y: local.y };
    const transformed = rotate(sheared, rotation);
    return {
      x: transformed.x + globalOffset.x,
      y: transformed.y + globalOffset.y,
    };
  });
}
