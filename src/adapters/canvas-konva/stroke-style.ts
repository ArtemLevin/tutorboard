import type { StrokeStyle, Vec2 } from "../../core/public";

export interface ResolvedStrokeStyle {
  readonly dash?: readonly number[];
  readonly lineCap: "butt" | "round";
  readonly opacityMultiplier: number;
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
        dash: [2, 1],
        lineCap: "round",
        opacityMultiplier: 0.72,
        strokeWidth: Math.max(1.5, fallbackWidth),
      };
    case "hand-pen":
      return {
        lineCap: "round",
        opacityMultiplier: 0.94,
        strokeWidth: Math.max(2.5, fallbackWidth),
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

export function createWavySegment(end: Vec2): readonly number[] {
  const length = Math.hypot(end.x, end.y);
  if (length === 0) return [0, 0, 0, 0];
  const normalX = -end.y / length;
  const normalY = end.x / length;
  const samples = Math.max(12, Math.ceil(length / 8));
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

export function createHandDrawnSegment(
  end: Vec2,
  intensity: number,
): readonly number[] {
  const length = Math.hypot(end.x, end.y);
  if (length === 0) return [0, 0, 0, 0];
  const normalX = -end.y / length;
  const normalY = end.x / length;
  const samples = Math.max(8, Math.ceil(length / 14));
  const points: number[] = [];
  for (let index = 0; index <= samples; index += 1) {
    const progress = index / samples;
    const deterministicNoise =
      Math.sin(index * 12.9898 + length * 0.017) * 0.65 +
      Math.sin(index * 4.123 + end.x * 0.011) * 0.35;
    const offset = deterministicNoise * intensity;
    points.push(
      end.x * progress + normalX * offset,
      end.y * progress + normalY * offset,
    );
  }
  return points;
}
