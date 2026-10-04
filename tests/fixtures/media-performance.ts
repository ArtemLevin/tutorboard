import {
  boardObjectId,
  createEmptyBoardDocument,
  createVectorInkData,
  documentId,
  type BoardDocument,
  type EmbeddedImageObject,
  type PenStrokeObject,
} from "../../src/core/public";
import { createCoordinatePlotProductionObject } from "./coordinate-plot-production";

export const mediaPerformancePngDataUrl =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZC9sAAAAASUVORK5CYII=";

export const mediaPerformanceGifDataUrl =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

const timestamp = "2026-10-04T18:30:00.000Z";

function digest(seed: number): string {
  return seed.toString(16).padStart(64, "0").slice(-64);
}

function mediaObject(
  index: number,
  input: {
    readonly dataUrl: string;
    readonly intrinsicSize?: { readonly height: number; readonly width: number };
    readonly kind: "gif" | "static";
    readonly offscreen?: boolean;
  },
): EmbeddedImageObject {
  const column = index % 5;
  const row = Math.floor(index / 5);
  const intrinsicSize = input.intrinsicSize ?? { height: 900, width: 1_200 };
  const id = boardObjectId(`object:media-performance:${input.kind}:${index}`);
  return {
    contentSha256: digest(index + (input.kind === "gif" ? 10_000 : 1)),
    dataUrl: input.dataUrl,
    fileName: `${input.kind}-${index}.${input.kind === "gif" ? "gif" : "png"}`,
    groupId: null,
    id,
    intrinsicSize,
    kind: "image.embedded",
    locked: false,
    mimeType: input.kind === "gif" ? "image/gif" : "image/png",
    position: input.offscreen
      ? { x: 20_000 + column * 140, y: 20_000 + row * 110 }
      : { x: 80 + column * 150, y: 80 + row * 120 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    size: { height: 90, width: 120 },
    source: { kind: "user" },
    style: {
      fill: null,
      opacity: 1,
      stroke: null,
      strokeWidth: 0,
    },
    visible: true,
  };
}

function mixedPenStroke(): PenStrokeObject {
  const samples = [
    {
      point: { x: 120, y: 520 },
      pressure: 0.45,
      timestampMs: 0,
    },
    {
      point: { x: 220, y: 555 },
      pressure: 0.6,
      timestampMs: 12,
    },
    {
      point: { x: 340, y: 515 },
      pressure: 0.55,
      timestampMs: 24,
    },
    {
      point: { x: 460, y: 565 },
      pressure: 0.7,
      timestampMs: 36,
    },
  ];
  const id = boardObjectId("object:media-performance:pen");
  return {
    groupId: null,
    id,
    ink: createVectorInkData(samples),
    kind: "drawing.pen-stroke",
    locked: false,
    points: samples.map(({ point }) => point),
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    source: { kind: "user" },
    style: {
      fill: null,
      opacity: 1,
      stroke: "#17202a",
      strokeWidth: 3,
    },
    visible: true,
  };
}

export interface MediaPerformanceDocumentOptions {
  readonly gifCount?: number;
  readonly largeStaticDataUrl?: string | undefined;
  readonly mixed?: boolean;
  readonly offscreen?: boolean;
  readonly staticCount?: number;
}

export function createMediaPerformanceDocument(
  options: MediaPerformanceDocumentOptions = {},
): BoardDocument {
  const staticCount = options.staticCount ?? 0;
  const gifCount = options.gifCount ?? 0;
  const base = createEmptyBoardDocument({
    createdAt: timestamp,
    id: documentId(
      `document:media-performance:${staticCount}:${gifCount}:${options.mixed ? "mixed" : "plain"}:${options.offscreen ? "offscreen" : "visible"}`,
    ),
    title: "Media performance fixture",
  });
  const staticImages = Array.from({ length: staticCount }, (_value, index) =>
    mediaObject(index, {
      dataUrl:
        index === 0 && options.largeStaticDataUrl !== undefined
          ? options.largeStaticDataUrl
          : mediaPerformancePngDataUrl,
      intrinsicSize:
        index === 0 && options.largeStaticDataUrl !== undefined
          ? { height: 1_024, width: 1_024 }
          : undefined,
      kind: "static",
      offscreen: options.offscreen,
    }),
  );
  const gifs = Array.from({ length: gifCount }, (_value, index) =>
    mediaObject(index, {
      dataUrl: mediaPerformanceGifDataUrl,
      kind: "gif",
      offscreen: options.offscreen,
    }),
  );
  const mixedObjects = options.mixed
    ? [
        mixedPenStroke(),
        {
          ...createCoordinatePlotProductionObject(90),
          id: boardObjectId("object:media-performance:plot"),
          position: { x: 760, y: 380 },
        },
      ]
    : [];
  const objects = [...staticImages, ...gifs, ...mixedObjects];
  return {
    ...base,
    objects: Object.fromEntries(objects.map((object) => [object.id, object])),
    order: objects.map(({ id }) => id),
    updatedAt: timestamp,
  };
}
