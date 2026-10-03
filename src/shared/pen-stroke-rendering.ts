import {
  createVectorInkData,
  vectorInkOutlinePathData,
  type StrokeStyle,
  type Vec2,
  type VectorInkData,
  type VectorInkSample,
} from "../core/public";

export interface PenStrokeRenderPath {
  readonly data: string;
  readonly opacityMultiplier: number;
}

export interface StrokeStyleSketchPassSpec {
  readonly dash?: readonly number[];
  readonly intensity: number;
  readonly opacityMultiplier: number;
  readonly seed: number;
  readonly widthMultiplier: number;
}

const dashedPattern = [12, 8] as const;
const dashDotPattern = [14, 6, 2, 6] as const;
const wavyBaseSpacing = 8;
const sketchBaseSpacing = 12;
const maximumStylizedSamples = 4096;

function distance(left: Vec2, right: Vec2): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function interpolateSample(
  start: VectorInkSample,
  end: VectorInkSample,
  ratio: number,
): VectorInkSample {
  return {
    point: {
      x: start.point.x + (end.point.x - start.point.x) * ratio,
      y: start.point.y + (end.point.y - start.point.y) * ratio,
    },
    pressure: start.pressure + (end.pressure - start.pressure) * ratio,
    timestampMs:
      start.timestampMs + (end.timestampMs - start.timestampMs) * ratio,
  };
}

function normalizedSourceSamples(
  ink: VectorInkData,
): readonly VectorInkSample[] {
  if (ink.samples.length === 0) return [];
  if (!ink.closed) return ink.samples;
  const first = ink.samples[0]!;
  const last = ink.samples.at(-1)!;
  if (distance(first.point, last.point) < 0.001) return ink.samples;
  return [
    ...ink.samples,
    {
      ...first,
      timestampMs: Math.max(last.timestampMs, first.timestampMs) + 1,
    },
  ];
}

function resampleByArcLength(
  samples: readonly VectorInkSample[],
  spacing: number,
): readonly VectorInkSample[] {
  if (samples.length <= 1) return samples;
  const output: VectorInkSample[] = [samples[0]!];
  let carried = 0;

  for (let index = 1; index < samples.length; index += 1) {
    const start = samples[index - 1]!;
    const end = samples[index]!;
    const segmentLength = distance(start.point, end.point);
    if (segmentLength <= 1e-9) continue;

    let travelled = spacing - carried;
    while (
      travelled < segmentLength &&
      output.length < maximumStylizedSamples - 1
    ) {
      output.push(interpolateSample(start, end, travelled / segmentLength));
      travelled += spacing;
    }
    carried =
      segmentLength + carried < spacing
        ? segmentLength + carried
        : (segmentLength - (travelled - spacing)) % spacing;
  }

  const last = samples.at(-1)!;
  const previous = output.at(-1);
  if (
    previous === undefined ||
    previous.point.x !== last.point.x ||
    previous.point.y !== last.point.y
  ) {
    output.push(last);
  }
  return output.slice(0, maximumStylizedSamples);
}

function cumulativeDistances(
  samples: readonly VectorInkSample[],
): readonly number[] {
  const output: number[] = [0];
  for (let index = 1; index < samples.length; index += 1) {
    output.push(
      output[index - 1]! +
        distance(samples[index - 1]!.point, samples[index]!.point),
    );
  }
  return output;
}

function transformedSamples(
  samples: readonly VectorInkSample[],
  transform: (
    sample: VectorInkSample,
    index: number,
    distances: readonly number[],
  ) => Vec2,
): readonly VectorInkSample[] {
  const distances = cumulativeDistances(samples);
  return samples.map((sample, index) => ({
    ...sample,
    point: transform(sample, index, distances),
  }));
}

function tangent(
  samples: readonly VectorInkSample[],
  index: number,
  closed: boolean,
): Vec2 {
  const lastIndex = samples.length - 1;
  const previous =
    samples[index === 0 ? (closed ? Math.max(0, lastIndex - 1) : 0) : index - 1]
      ?.point ?? samples[index]!.point;
  const next =
    samples[
      index === lastIndex
        ? closed
          ? Math.min(1, lastIndex)
          : lastIndex
        : index + 1
    ]?.point ?? samples[index]!.point;
  const delta = { x: next.x - previous.x, y: next.y - previous.y };
  const length = Math.hypot(delta.x, delta.y);
  return length <= 1e-9
    ? { x: 1, y: 0 }
    : { x: delta.x / length, y: delta.y / length };
}

function wavySamples(ink: VectorInkData): readonly VectorInkSample[] {
  const source = normalizedSourceSamples(ink);
  const samples = resampleByArcLength(source, wavyBaseSpacing);
  const distances = cumulativeDistances(samples);
  const total = distances.at(-1) ?? 0;
  const cycles = ink.closed
    ? Math.max(2, Math.round(total / 36))
    : Math.max(2, total / 36);

  const transformed = transformedSamples(
    samples,
    (sample, index, pathDistances) => {
      const direction = tangent(samples, index, ink.closed);
      const normal = { x: -direction.y, y: direction.x };
      const progress = total <= 1e-9 ? 0 : pathDistances[index]! / total;
      const amplitude = Math.sin(progress * Math.PI * 2 * cycles) * 3;
      return {
        x: sample.point.x + normal.x * amplitude,
        y: sample.point.y + normal.y * amplitude,
      };
    },
  );
  if (!ink.closed || transformed.length < 2) return transformed;
  const first = transformed[0]!;
  const last = transformed.at(-1)!;
  return [
    ...transformed.slice(0, -1),
    {
      ...last,
      point: { ...first.point },
    },
  ];
}

function sketchSamples(
  ink: VectorInkData,
  intensity: number,
  seed: number,
): readonly VectorInkSample[] {
  const source = normalizedSourceSamples(ink);
  const samples = resampleByArcLength(source, sketchBaseSpacing);
  const distances = cumulativeDistances(samples);
  const lastIndex = Math.max(0, samples.length - 1);

  const transformed = transformedSamples(
    samples,
    (sample, index, pathDistances) => {
      const direction = tangent(samples, index, ink.closed);
      const normal = { x: -direction.y, y: direction.x };
      const progress = lastIndex === 0 ? 0 : index / lastIndex;
      const endpointEnvelope = ink.closed
        ? 1
        : 0.22 + Math.sin(progress * Math.PI) * 0.78;
      const distanceAlong = pathDistances[index] ?? 0;
      const noise =
        Math.sin((distanceAlong + 1) * (0.17 + seed * 0.0017) + seed * 0.37) *
          0.68 +
        Math.cos(
          (distanceAlong + 1) * (0.071 + seed * 0.0011) +
            sample.point.x * 0.011,
        ) *
          0.32;
      const offset = noise * intensity * endpointEnvelope;
      return {
        x: sample.point.x + normal.x * offset,
        y: sample.point.y + normal.y * offset,
      };
    },
  );
  if (!ink.closed || transformed.length < 2) return transformed;
  const first = transformed[0]!;
  const last = transformed.at(-1)!;
  return [
    ...transformed.slice(0, -1),
    {
      ...last,
      point: { ...first.point },
    },
  ];
}

function splitByDashPattern(
  samples: readonly VectorInkSample[],
  pattern: readonly number[],
): readonly (readonly VectorInkSample[])[] {
  if (samples.length < 2 || pattern.length === 0) return [];
  const output: VectorInkSample[][] = [];
  let patternIndex = 0;
  let remaining = pattern[0]!;
  let visible = true;
  let current: VectorInkSample[] = visible ? [samples[0]!] : [];

  const advancePattern = (boundary: VectorInkSample) => {
    if (visible && current.length >= 2) output.push(current);
    patternIndex = (patternIndex + 1) % pattern.length;
    remaining = pattern[patternIndex]!;
    visible = patternIndex % 2 === 0;
    current = visible ? [boundary] : [];
  };

  for (let index = 1; index < samples.length; index += 1) {
    let start = samples[index - 1]!;
    const end = samples[index]!;
    let segmentRemaining = distance(start.point, end.point);
    if (segmentRemaining <= 1e-9) continue;

    while (segmentRemaining > remaining + 1e-9) {
      const ratio = remaining / segmentRemaining;
      const boundary = interpolateSample(start, end, ratio);
      if (visible) current.push(boundary);
      start = boundary;
      segmentRemaining -= remaining;
      advancePattern(boundary);
    }

    if (visible) current.push(end);
    remaining -= segmentRemaining;
    if (remaining <= 1e-9) {
      advancePattern(end);
    }
  }

  if (visible && current.length >= 2) output.push(current);
  return output;
}

function outlinePath(
  samples: readonly VectorInkSample[],
  strokeWidth: number,
  closed = false,
): string {
  if (samples.length < 2) return "";
  return vectorInkOutlinePathData(
    createVectorInkData(samples, closed),
    strokeWidth,
  );
}

function pushPath(
  output: PenStrokeRenderPath[],
  data: string,
  opacityMultiplier: number,
): void {
  if (data.length === 0) return;
  output.push({ data, opacityMultiplier });
}

function dashedPaths(
  samples: readonly VectorInkSample[],
  pattern: readonly number[],
  strokeWidth: number,
  opacityMultiplier: number,
): readonly PenStrokeRenderPath[] {
  const data = splitByDashPattern(samples, pattern)
    .map((segment) => outlinePath(segment, strokeWidth))
    .filter((path) => path.length > 0)
    .join(" ");
  return data.length === 0 ? [] : [{ data, opacityMultiplier }];
}

export function strokeStyleSketchPassSpecs(
  style: StrokeStyle | undefined,
): readonly StrokeStyleSketchPassSpec[] {
  switch (style) {
    case "hand-pencil":
      return [
        {
          intensity: 2.8,
          opacityMultiplier: 0.42,
          seed: 11,
          widthMultiplier: 0.65,
        },
        {
          intensity: 1.8,
          opacityMultiplier: 0.3,
          seed: 29,
          widthMultiplier: 0.45,
        },
        {
          dash: [1, 2],
          intensity: 0.9,
          opacityMultiplier: 0.2,
          seed: 47,
          widthMultiplier: 0.28,
        },
      ];
    case "hand-pen":
      return [
        {
          intensity: 1.15,
          opacityMultiplier: 0.88,
          seed: 7,
          widthMultiplier: 1,
        },
        {
          intensity: 0.75,
          opacityMultiplier: 0.24,
          seed: 23,
          widthMultiplier: 0.35,
        },
      ];
    default:
      return [];
  }
}

export function strokeStyleDashPattern(
  style: StrokeStyle | undefined,
): readonly number[] | undefined {
  if (style === "dashed") return dashedPattern;
  if (style === "dash-dot") return dashDotPattern;
  return undefined;
}

export function strokeStyleOpacityMultiplier(
  style: StrokeStyle | undefined,
): number {
  return style === "marker" ? 0.38 : 1;
}

export function createPenStrokeRenderPaths(
  ink: VectorInkData,
  style: StrokeStyle | undefined,
  strokeWidth: number,
): readonly PenStrokeRenderPath[] {
  const width = Math.max(0, strokeWidth);
  if (width === 0 || ink.samples.length < 2) return [];

  if (style === "dashed" || style === "dash-dot") {
    return dashedPaths(
      normalizedSourceSamples(ink),
      strokeStyleDashPattern(style) ?? [],
      width,
      1,
    );
  }

  if (style === "wavy") {
    const data = outlinePath(wavySamples(ink), width, ink.closed);
    return data.length === 0 ? [] : [{ data, opacityMultiplier: 1 }];
  }

  if (style === "hand-pencil" || style === "hand-pen") {
    const output: PenStrokeRenderPath[] = [];
    for (const pass of strokeStyleSketchPassSpecs(style)) {
      const samples = sketchSamples(ink, pass.intensity, pass.seed);
      const passWidth = width * pass.widthMultiplier;
      if (pass.dash === undefined) {
        pushPath(
          output,
          outlinePath(samples, passWidth, ink.closed),
          pass.opacityMultiplier,
        );
      } else {
        output.push(
          ...dashedPaths(samples, pass.dash, passWidth, pass.opacityMultiplier),
        );
      }
    }
    return output;
  }

  const data = vectorInkOutlinePathData(ink, width);
  return data.length === 0
    ? []
    : [{ data, opacityMultiplier: strokeStyleOpacityMultiplier(style) }];
}
