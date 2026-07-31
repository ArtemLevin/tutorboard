import type { Size2, StrokeStyle, Vec2 } from "../../core/public";

export interface ResolvedStrokeStyle {
  readonly dash?: readonly number[];
  readonly lineCap: "butt" | "round" | "square";
  readonly opacityMultiplier: number;
  readonly strokeWidth: number;
}

export interface SketchPass {
  readonly dash?: readonly number[];
  readonly intensity: number;
  readonly opacityMultiplier: number;
  readonly seed: number;
  readonly strokeWidth: number;
}

export function resolveStrokeStyle(
  style: StrokeStyle | undefined,
  fallbackWidth: number,
): ResolvedStrokeStyle {
  switch (style) {
    case "thin":
      return { lineCap: "round", opacityMultiplier: 1, strokeWidth: 2 };
    case "thick":
      return { lineCap: "round", opacityMultiplier: 1, strokeWidth: 6 };
    case "dashed":
      return {
        dash: [12, 8],
        lineCap: "round",
        opacityMultiplier: 1,
        strokeWidth: Math.max(2, fallbackWidth),
      };
    case "dash-dot":
      return {
        dash: [14, 6, 2, 6],
        lineCap: "round",
        opacityMultiplier: 1,
        strokeWidth: Math.max(2, fallbackWidth),
      };
    case "hand-pencil":
      return {
        lineCap: "round",
        opacityMultiplier: 1,
        strokeWidth: Math.max(1.5, fallbackWidth),
      };
    case "hand-pen":
      return {
        lineCap: "round",
        opacityMultiplier: 1,
        strokeWidth: Math.max(2.5, fallbackWidth),
      };
    case "marker":
      return {
        lineCap: "square",
        opacityMultiplier: 0.38,
        strokeWidth: Math.max(10, fallbackWidth * 3.2),
      };
    case "wavy":
      return {
        lineCap: "round",
        opacityMultiplier: 1,
        strokeWidth: Math.max(2, fallbackWidth),
      };
    default:
      return {
        lineCap: "round",
        opacityMultiplier: 1,
        strokeWidth: fallbackWidth,
      };
  }
}

export function resolveSketchPasses(
  style: StrokeStyle | undefined,
  fallbackWidth: number,
): readonly SketchPass[] {
  switch (style) {
    case "hand-pencil":
      return [
        {
          intensity: 2.8,
          opacityMultiplier: 0.42,
          seed: 11,
          strokeWidth: Math.max(1.1, fallbackWidth * 0.65),
        },
        {
          intensity: 1.8,
          opacityMultiplier: 0.3,
          seed: 29,
          strokeWidth: Math.max(0.8, fallbackWidth * 0.45),
        },
        {
          dash: [1, 2],
          intensity: 0.9,
          opacityMultiplier: 0.2,
          seed: 47,
          strokeWidth: Math.max(0.55, fallbackWidth * 0.28),
        },
      ];
    case "hand-pen":
      return [
        {
          intensity: 1.15,
          opacityMultiplier: 0.88,
          seed: 7,
          strokeWidth: Math.max(2.2, fallbackWidth),
        },
        {
          intensity: 0.75,
          opacityMultiplier: 0.24,
          seed: 23,
          strokeWidth: Math.max(0.9, fallbackWidth * 0.35),
        },
      ];
    default:
      return [];
  }
}

export function isSketchStrokeStyle(
  style: StrokeStyle | undefined,
): style is "hand-pencil" | "hand-pen" {
  return style === "hand-pencil" || style === "hand-pen";
}

function renderSampleCount(
  length: number,
  baseSpacing: number,
  minimum: number,
  zoom: number,
): number {
  const renderZoom = Math.min(8, Math.max(0.1, zoom));
  const spacing = Math.max(1.5, baseSpacing / Math.sqrt(renderZoom));
  return Math.min(4096, Math.max(minimum, Math.ceil(length / spacing)));
}

export function createWavySegment(end: Vec2, zoom = 1): readonly number[] {
  const length = Math.hypot(end.x, end.y);
  if (length === 0) return [0, 0, 0, 0];
  const normalX = -end.y / length;
  const normalY = end.x / length;
  const samples = renderSampleCount(length, 8, 12, zoom);
  const points: number[] = [];
  for (let index = 0; index <= samples; index += 1) {
    const progress = index / samples;
    const amplitude =
      Math.sin(progress * Math.PI * 2 * Math.max(2, length / 36)) * 3;
    points.push(
      end.x * progress + normalX * amplitude,
      end.y * progress + normalY * amplitude,
    );
  }
  return points;
}

function segmentPoints(end: Vec2, zoom = 1): readonly Vec2[] {
  const length = Math.hypot(end.x, end.y);
  const samples = renderSampleCount(length, 12, 8, zoom);
  return Array.from({ length: samples + 1 }, (_, index) => {
    const progress = index / samples;
    return { x: end.x * progress, y: end.y * progress };
  });
}

export function createSketchPath(
  sourcePoints: readonly Vec2[],
  intensity: number,
  seed: number,
  closed = false,
): readonly number[] {
  if (sourcePoints.length === 0) return [0, 0, 0, 0];
  if (sourcePoints.length === 1) {
    const point = sourcePoints[0];
    return point === undefined ? [0, 0, 0, 0] : [point.x, point.y];
  }

  const lastIndex = sourcePoints.length - 1;
  const pathDistances: number[] = [0];
  for (let index = 1; index < sourcePoints.length; index += 1) {
    const previous = sourcePoints[index - 1];
    const point = sourcePoints[index];
    pathDistances.push(
      (pathDistances[index - 1] ?? 0) +
        (previous === undefined || point === undefined
          ? 0
          : Math.hypot(point.x - previous.x, point.y - previous.y)),
    );
  }

  const output: number[] = [];
  for (let index = 0; index < sourcePoints.length; index += 1) {
    const point = sourcePoints[index];
    if (point === undefined) continue;
    const previous =
      sourcePoints[index === 0 ? (closed ? lastIndex : 0) : index - 1] ?? point;
    const next =
      sourcePoints[
        index === lastIndex ? (closed ? 0 : lastIndex) : index + 1
      ] ?? point;
    const tangentX = next.x - previous.x;
    const tangentY = next.y - previous.y;
    const tangentLength = Math.hypot(tangentX, tangentY) || 1;
    const normalX = -tangentY / tangentLength;
    const normalY = tangentX / tangentLength;
    const progress = lastIndex === 0 ? 0 : index / lastIndex;
    const endpointEnvelope = closed
      ? 1
      : 0.22 + Math.sin(progress * Math.PI) * 0.78;
    const distanceAlong = pathDistances[index] ?? 0;
    const noise =
      Math.sin((distanceAlong + 1) * (0.17 + seed * 0.0017) + seed * 0.37) *
        0.68 +
      Math.cos(
        (distanceAlong + 1) * (0.071 + seed * 0.0011) + point.x * 0.011,
      ) *
        0.32;
    const offset = noise * intensity * endpointEnvelope;
    output.push(point.x + normalX * offset, point.y + normalY * offset);
  }
  return output;
}

export function createHandDrawnSegment(
  end: Vec2,
  intensity: number,
  seed = 0,
  zoom = 1,
): readonly number[] {
  return createSketchPath(segmentPoints(end, zoom), intensity, seed);
}

export function createRectangleContour(size: Size2): readonly Vec2[] {
  const stepsPerEdge = Math.max(
    4,
    Math.ceil(Math.max(size.width, size.height) / 32),
  );
  const points: Vec2[] = [];
  const appendEdge = (from: Vec2, to: Vec2) => {
    for (let index = 0; index < stepsPerEdge; index += 1) {
      const progress = index / stepsPerEdge;
      points.push({
        x: from.x + (to.x - from.x) * progress,
        y: from.y + (to.y - from.y) * progress,
      });
    }
  };
  appendEdge({ x: 0, y: 0 }, { x: size.width, y: 0 });
  appendEdge({ x: size.width, y: 0 }, { x: size.width, y: size.height });
  appendEdge({ x: size.width, y: size.height }, { x: 0, y: size.height });
  appendEdge({ x: 0, y: size.height }, { x: 0, y: 0 });
  return points;
}

export function createEllipseContour(radius: Vec2): readonly Vec2[] {
  const samples = Math.max(36, Math.ceil(Math.max(radius.x, radius.y) / 3));
  return Array.from({ length: samples }, (_, index) => {
    const angle = (index / samples) * Math.PI * 2;
    return {
      x: Math.cos(angle) * radius.x,
      y: Math.sin(angle) * radius.y,
    };
  });
}
