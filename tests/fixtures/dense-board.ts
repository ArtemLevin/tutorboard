import { createVectorInkData } from "../../src/core/public";

const pngDataUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWO4o+H2HwAFeAJKw8yxJQAAAABJRU5ErkJggg==";
const gifDataUrl =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/** The default fixture stays byte-for-byte compatible with older tests. */
export interface DenseBoardFixtureOptions {
  readonly gifCount?: number;
  readonly staticCount?: number;
  readonly strokeCount?: number;
  readonly largeStaticDataUrls?: readonly string[];
  readonly strokeGeometry?: "repeated" | "varied";
  readonly visibleStrokeCount?: number;
  readonly zOrderPattern?: "trailing" | "split" | "alternating";
  readonly animatedGifDataUrl?: string;
  readonly animatedGifSize?: {
    readonly width: number;
    readonly height: number;
  };
}

function representativeInk(index: number) {
  const segments = 2 + (index % 5);
  const points = Array.from({ length: segments + 1 }, (_unused, step) => ({
    x: step * (12 + (index % 7)),
    y: step * (index % 3) + ((step * step + index * 3) % 13) - 6,
  }));
  return {
    points,
    ink: createVectorInkData(
      points.map((point, step) => ({
        point,
        pressure: 0.25 + ((index + step) % 6) * 0.12,
        timestampMs: step * 8,
      })),
      false,
    ),
  };
}

export function createDenseBoardDocument({
  gifCount = 0,
  staticCount = 10,
  strokeCount = 300,
  largeStaticDataUrls = [],
  strokeGeometry = "repeated",
  visibleStrokeCount,
  zOrderPattern = "trailing",
  animatedGifDataUrl,
  animatedGifSize,
}: DenseBoardFixtureOptions = {}) {
  const base = {
    createdAt: "2026-10-05T16:00:00.000Z",
    id: "document:dense-board",
    geometryImports: {},
    groups: {},
    schemaVersion: "1.6" as const,
    solidLearningAttempts: {},
    solidModels: {},
    updatedAt: "2026-10-05T16:00:00.000Z",
    viewport: { offset: { x: 0, y: 0 }, zoom: 1 },
    title: "Dense board regression",
  };
  const common = {
    groupId: null,
    locked: false,
    rotation: 0,
    scale: { x: 1, y: 1 },
    source: { kind: "user" as const },
    visible: true,
  };
  const points = [
    { x: 0, y: 0 },
    { x: 30, y: 12 },
    { x: 60, y: 0 },
  ];
  // A canonical two-segment Vector Ink fixture, checked by the core validator.
  const ink = {
    centerline: [
      {
        start: points[0]!,
        control1: { x: 30 * (1 / 6), y: 12 * (1 / 6) },
        control2: { x: 30 - 60 * (1 / 6), y: 12 },
        end: points[1]!,
      },
      {
        start: points[1]!,
        control1: { x: 30 + 60 * (1 / 6), y: 12 },
        control2: { x: 60 - 30 * (1 / 6), y: 12 * (1 / 6) },
        end: points[2]!,
      },
    ],
    closed: false,
    samples: points.map((point, index) => ({
      point,
      pressure: 0.5,
      timestampMs: index * 8,
    })),
    version: "1.0" as const,
  };
  const strokes = Array.from({ length: strokeCount }, (_, index) => {
    const geometry =
      strokeGeometry === "varied" ? representativeInk(index) : { points, ink };
    const offscreen =
      visibleStrokeCount !== undefined && index >= visibleStrokeCount;
    return {
      ...common,
      id: `object:dense:stroke:${index}`,
      ink: geometry.ink,
      kind: "drawing.pen-stroke" as const,
      points: geometry.points,
      position: offscreen
        ? {
            x: 10_000 + (index % 10) * 65,
            y: 10_000 + Math.floor(index / 10) * 8,
          }
        : visibleStrokeCount === undefined
          ? { x: 60 + (index % 10) * 65, y: 180 + Math.floor(index / 10) * 8 }
          : {
              x: 60 + (index % 24) * 38,
              y: 160 + (Math.floor(index / 24) % 16) * 29,
            },
      style: {
        fill: null,
        opacity: strokeGeometry === "varied" ? 0.6 + (index % 4) * 0.1 : 1,
        stroke: "#17202a",
        strokeWidth: strokeGeometry === "varied" ? 1 + (index % 5) : 2,
      },
    };
  });
  const images = Array.from({ length: staticCount + gifCount }, (_, index) => {
    const gif = index >= staticCount;
    const largeDataUrl = gif ? undefined : largeStaticDataUrls[index];
    return {
      ...common,
      contentSha256: (index + 1).toString(16).padStart(64, "0"),
      dataUrl: gif
        ? (animatedGifDataUrl ?? gifDataUrl)
        : (largeDataUrl ?? pngDataUrl),
      fileName: `image-${index}.${gif ? "gif" : "png"}`,
      id: `object:dense:image:${index}`,
      intrinsicSize:
        gif && animatedGifSize !== undefined
          ? animatedGifSize
          : largeDataUrl === undefined
            ? { height: 1, width: 1 }
            : { height: 1_536, width: 1_536 },
      kind: "image.embedded" as const,
      mimeType: gif ? "image/gif" : "image/png",
      position: { x: 80 + (index % 10) * 65, y: 80 },
      size:
        gif && animatedGifSize !== undefined
          ? { height: 96, width: 96 }
          : largeDataUrl === undefined
            ? { height: 40, width: 40 }
            : { height: 140, width: 140 },
      style: { fill: null, opacity: 1, stroke: null, strokeWidth: 0 },
    };
  });
  const objects = [...strokes, ...images];
  let ordered = objects;
  if (zOrderPattern === "split" && gifCount > 0) {
    const gifImages = images.filter((image) => image.mimeType === "image/gif");
    const staticImages = images.filter(
      (image) => image.mimeType !== "image/gif",
    );
    const half = Math.floor(strokes.length / 2);
    ordered = [
      ...strokes.slice(0, half),
      ...gifImages.slice(0, 1),
      ...strokes.slice(half),
      ...gifImages.slice(1),
      ...staticImages,
    ];
  } else if (zOrderPattern === "alternating" && gifCount > 0) {
    const png = images.filter((image) => image.mimeType !== "image/gif");
    const gifs = images.filter((image) => image.mimeType === "image/gif");
    const media = Array.from(
      { length: Math.max(png.length, gifs.length) },
      (_unused, index) => [png[index], gifs[index]],
    ).flatMap((pair) => pair.filter((image) => image !== undefined));
    const reordered = [];
    for (let index = 0; index < media.length; index += 1) {
      const from = Math.floor((index * strokes.length) / (media.length + 1));
      const to = Math.floor(
        ((index + 1) * strokes.length) / (media.length + 1),
      );
      reordered.push(...strokes.slice(from, to), media[index]!);
    }
    reordered.push(
      ...strokes.slice(
        Math.floor((media.length * strokes.length) / (media.length + 1)),
      ),
    );
    ordered = reordered;
  }
  return {
    ...base,
    objects: Object.fromEntries(objects.map((object) => [object.id, object])),
    order: ordered.map((object) => object.id),
  };
}
