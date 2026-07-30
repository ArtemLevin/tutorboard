import type { Vec2 } from "../../../../src/core/public";
import {
  smartInkCorpusSchemaVersion,
  type SmartInkCorpus,
  type SmartInkCorpusSample,
  type SmartInkPrimitiveKind,
} from "../../../../src/modules/smart-ink-spike/public";

function rotate(point: Vec2, angle: number): Vec2 {
  return {
    x: point.x * Math.cos(angle) - point.y * Math.sin(angle),
    y: point.x * Math.sin(angle) + point.y * Math.cos(angle),
  };
}

function transform(
  points: readonly Vec2[],
  angle = 0,
  offset: Vec2 = { x: 170, y: 90 },
  scale = 1,
): readonly Vec2[] {
  return points.map((point) => {
    const rotated = rotate({ x: point.x * scale, y: point.y * scale }, angle);
    return { x: rotated.x + offset.x, y: rotated.y + offset.y };
  });
}

function noise(index: number, amount: number): number {
  return (
    Math.sin(index * 12.9898 + 4.1414) *
    Math.cos(index * 3.7712 + 1.931) *
    amount
  );
}

function line(): readonly Vec2[] {
  return transform(
    Array.from({ length: 45 }, (_, index) => {
      const progress = index / 44;
      return {
        x: -80 + progress * 160,
        y: noise(index, 1.2),
      };
    }),
    0.47,
  );
}

function oval(radiusX: number, radiusY: number): readonly Vec2[] {
  return transform(
    Array.from({ length: 97 }, (_, index) => {
      const angle = (index / 96) * Math.PI * 2;
      const radialNoise = noise(index, 1.3);
      return {
        x: Math.cos(angle) * (radiusX + radialNoise),
        y: Math.sin(angle) * (radiusY + radialNoise * 0.65),
      };
    }),
    0.31,
  );
}

function polygon(vertices: readonly Vec2[]): readonly Vec2[] {
  const points: Vec2[] = [];
  const pointsPerEdge = 22;
  for (let edge = 0; edge < vertices.length; edge += 1) {
    const start = vertices[edge]!;
    const end = vertices[(edge + 1) % vertices.length]!;
    for (let index = 0; index < pointsPerEdge; index += 1) {
      const progress = index / pointsPerEdge;
      const jitter = noise(edge * pointsPerEdge + index, 1.15);
      points.push({
        x:
          start.x +
          (end.x - start.x) * progress +
          jitter * Math.sin(edge + 0.7),
        y:
          start.y +
          (end.y - start.y) * progress +
          jitter * Math.cos(edge + 0.4),
      });
    }
  }
  points.push({ ...points[0]! });
  return transform(points, 0.23);
}

export const positiveStrokes: Readonly<
  Record<SmartInkPrimitiveKind, readonly Vec2[]>
> = {
  circle: oval(62, 62),
  ellipse: oval(84, 43),
  line: line(),
  rectangle: polygon([
    { x: -88, y: -43 },
    { x: 88, y: -43 },
    { x: 88, y: 43 },
    { x: -88, y: 43 },
  ]),
  square: polygon([
    { x: -58, y: -58 },
    { x: 58, y: -58 },
    { x: 58, y: 58 },
    { x: -58, y: 58 },
  ]),
  triangle: polygon([
    { x: 0, y: -73 },
    { x: 76, y: 62 },
    { x: -66, y: 55 },
  ]),
};

export function nearSquareStroke(): readonly Vec2[] {
  return polygon([
    { x: -62, y: -57 },
    { x: 62, y: -57 },
    { x: 62, y: 57 },
    { x: -62, y: 57 },
  ]);
}

function sampledParametric(
  count: number,
  pointAt: (progress: number) => Vec2,
): readonly Vec2[] {
  return Array.from({ length: count }, (_, index) =>
    pointAt(index / (count - 1)),
  );
}

const negativeBases: Readonly<Record<string, readonly Vec2[]>> = {
  arc: sampledParametric(54, (progress) => {
    const angle = -Math.PI * 0.8 + progress * Math.PI * 1.6;
    return { x: Math.cos(angle) * 68, y: Math.sin(angle) * 68 };
  }),
  arrow: [
    { x: -82, y: 0 },
    { x: 74, y: 0 },
    { x: 38, y: -28 },
    { x: 74, y: 0 },
    { x: 38, y: 28 },
  ],
  bracket: [
    { x: 64, y: -74 },
    { x: 16, y: -74 },
    { x: 16, y: 74 },
    { x: 64, y: 74 },
  ],
  chevron: [
    { x: -72, y: -48 },
    { x: 0, y: 54 },
    { x: 72, y: -48 },
  ],
  digitEight: sampledParametric(100, (progress) => {
    const angle = progress * Math.PI * 2;
    return {
      x: Math.sin(angle) * 48,
      y: Math.sin(angle * 2) * 66,
    };
  }),
  formulaLike: [
    { x: -90, y: 20 },
    { x: -65, y: -28 },
    { x: -42, y: 20 },
    { x: -22, y: -28 },
    { x: -2, y: 20 },
    { x: 22, y: 20 },
    { x: 48, y: -30 },
    { x: 78, y: 22 },
  ],
  hook: sampledParametric(60, (progress) => {
    const angle = progress * Math.PI * 1.3;
    return {
      x: Math.cos(angle) * (18 + progress * 55),
      y: Math.sin(angle) * (18 + progress * 55),
    };
  }),
  sine: sampledParametric(80, (progress) => ({
    x: -90 + progress * 180,
    y: Math.sin(progress * Math.PI * 4) * 32,
  })),
  spiral: sampledParametric(100, (progress) => {
    const angle = progress * Math.PI * 5;
    const radius = 10 + progress * 62;
    return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
  }),
  zigzag: [
    { x: -90, y: -38 },
    { x: -54, y: 38 },
    { x: -18, y: -38 },
    { x: 18, y: 38 },
    { x: 54, y: -38 },
    { x: 90, y: 38 },
  ],
};

export const negativeStrokes: readonly {
  readonly id: string;
  readonly points: readonly Vec2[];
}[] = Object.entries(negativeBases).flatMap(([name, points]) =>
  Array.from({ length: 6 }, (_, variant) => ({
    id: `${name}-${variant}`,
    points: transform(
      points,
      variant * 0.29,
      { x: 140 + variant * 3, y: 110 - variant * 2 },
      0.82 + variant * 0.07,
    ),
  })),
);

function metadata(durationMs: number) {
  return {
    browser: "other" as const,
    deviceProfile: "synthetic-fixture" as const,
    durationMs,
    pointerType: "mouse" as const,
  };
}

export function createSyntheticBenchmarkCorpus(): SmartInkCorpus {
  const positives: SmartInkCorpusSample[] = Object.entries(positiveStrokes).map(
    ([kind, points]) => ({
      acceptableKinds:
        kind === "circle"
          ? ["circle", "ellipse"]
          : kind === "ellipse"
            ? ["ellipse", "circle"]
            : kind === "square"
              ? ["square", "rectangle"]
              : kind === "rectangle"
                ? ["rectangle", "square"]
                : [kind as SmartInkPrimitiveKind],
      expectedKind: kind as SmartInkPrimitiveKind,
      id: `synthetic-positive-${kind}`,
      metadata: metadata(420),
      points,
      provenance: "synthetic",
      shouldPropose: true,
    }),
  );
  const negatives: SmartInkCorpusSample[] = negativeStrokes.map(
    ({ id, points }) => ({
      acceptableKinds: [],
      expectedKind: "negative",
      id: `synthetic-negative-${id}`,
      metadata: metadata(510),
      points,
      provenance: "synthetic",
      shouldPropose: false,
    }),
  );
  return {
    samples: [...positives, ...negatives],
    schemaVersion: smartInkCorpusSchemaVersion,
  };
}
