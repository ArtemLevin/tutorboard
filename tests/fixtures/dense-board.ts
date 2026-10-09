const pngDataUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWO4o+H2HwAFeAJKw8yxJQAAAABJRU5ErkJggg==";
const gifDataUrl =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

export function createDenseBoardDocument({
  gifCount = 0,
  staticCount = 10,
  strokeCount = 300,
  largeStaticDataUrls = [],
}: {
  readonly gifCount?: number;
  readonly staticCount?: number;
  readonly strokeCount?: number;
  readonly largeStaticDataUrls?: readonly string[];
} = {}) {
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
  const strokes = Array.from({ length: strokeCount }, (_, index) => ({
    ...common,
    id: `object:dense:stroke:${index}`,
    ink,
    kind: "drawing.pen-stroke" as const,
    points,
    position: {
      x: 60 + (index % 10) * 65,
      y: 180 + Math.floor(index / 10) * 8,
    },
    style: { fill: null, opacity: 1, stroke: "#17202a", strokeWidth: 2 },
  }));
  const images = Array.from({ length: staticCount + gifCount }, (_, index) => {
    const gif = index >= staticCount;
    const largeDataUrl = gif ? undefined : largeStaticDataUrls[index];
    return {
      ...common,
      contentSha256: (index + 1).toString(16).padStart(64, "0"),
      dataUrl: gif ? gifDataUrl : (largeDataUrl ?? pngDataUrl),
      fileName: `image-${index}.${gif ? "gif" : "png"}`,
      id: `object:dense:image:${index}`,
      intrinsicSize:
        largeDataUrl === undefined
          ? { height: 1, width: 1 }
          : { height: 1_536, width: 1_536 },
      kind: "image.embedded" as const,
      mimeType: gif ? "image/gif" : "image/png",
      position: { x: 80 + (index % 10) * 65, y: 80 },
      size:
        largeDataUrl === undefined
          ? { height: 40, width: 40 }
          : { height: 140, width: 140 },
      style: { fill: null, opacity: 1, stroke: null, strokeWidth: 0 },
    };
  });
  const objects = [...strokes, ...images];
  return {
    ...base,
    objects: Object.fromEntries(objects.map((object) => [object.id, object])),
    order: objects.map((object) => object.id),
  };
}
