import {
  type BoardMediaAssetDescriptor,
  type BoardMediaRepository,
  type DocumentId,
  type MediaAssetObject,
  type BoardObjectId,
  type Size2,
  type Vec2,
} from "../core/public";
import {
  fitEmbeddedImageSize,
  imageMimeFromBytes,
  rasterDimensionsFromBytes,
  safeFileName,
  sha256,
  validIntrinsicSize,
  validateStaticRasterDecode,
} from "./image-import";

export const rasterAssetImportLimits = {
  maxFileBytes: 32 * 1024 * 1024,
  maxBatchBytes: 96 * 1024 * 1024,
} as const;

export interface PreparedRasterAsset {
  readonly body: Blob;
  readonly contentSha256: string;
  readonly fileName: string;
  readonly intrinsicSize: Size2;
  readonly mimeType: "image/png" | "image/jpeg" | "image/gif";
}

export type RasterAssetResult =
  | { readonly status: "ok"; readonly value: PreparedRasterAsset }
  | { readonly status: "error"; readonly code: string; readonly message: string };

export interface BoardMediaUploadSession {
  readonly documentId: DocumentId;
  readonly getCsrfToken: () => Promise<string>;
  readonly isCurrent: () => boolean;
  readonly uploadMedia: BoardMediaRepository["uploadMedia"];
}

export type UploadedRasterResult =
  | { readonly status: "ok"; readonly descriptor: BoardMediaAssetDescriptor }
  | { readonly status: "cancelled" }
  | { readonly status: "error"; readonly message: string };

export function isRasterAssetCandidate(file: File): boolean {
  return (
    ["image/png", "image/jpeg", "image/gif"].includes(file.type.toLowerCase()) ||
    /\.(?:png|jpe?g|gif)$/iu.test(file.name)
  );
}

function fail(code: string, message: string): RasterAssetResult {
  return { status: "error", code, message };
}

function gifDimensions(blob: Blob): Promise<Size2> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ height: image.naturalHeight, width: image.naturalWidth });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image.decode-failed"));
    };
    image.src = url;
  });
}

/** Validate and hash once without encoding binary media as a data URL. */
export async function prepareRasterAssetFile(file: File): Promise<RasterAssetResult> {
  if (file.size === 0) return fail("image.empty-file", "Файл изображения пуст.");
  if (file.size > rasterAssetImportLimits.maxFileBytes) {
    return fail("image.input-too-large", "Размер изображения превышает 32 МБ.");
  }
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return fail("image.read-failed", "Не удалось прочитать изображение.");
  }
  const mimeType = imageMimeFromBytes(bytes);
  if (mimeType !== "image/png" && mimeType !== "image/jpeg" && mimeType !== "image/gif") {
    return fail("image.unsupported-format", "Для загрузки поддерживаются PNG, JPEG и GIF.");
  }
  let dimensions: Size2;
  try {
    if (mimeType === "image/gif") {
      dimensions = await gifDimensions(file);
    } else {
      const header = rasterDimensionsFromBytes(bytes, mimeType);
      if (header === null) throw new Error("image.decode-failed");
      dimensions = header;
      await validateStaticRasterDecode(bytes, mimeType);
    }
  } catch {
    return fail("image.decode-failed", "Изображение повреждено или не удалось декодировать.");
  }
  if (!validIntrinsicSize(dimensions)) {
    return fail("image.dimension-limit-exceeded", "Размеры изображения превышают допустимый предел.");
  }
  return {
    status: "ok",
    value: {
      body: file,
      contentSha256: await sha256(bytes),
      fileName: safeFileName(file.name),
      intrinsicSize: dimensions,
      mimeType,
    },
  };
}

/** Upload reaches AVAILABLE before any board command can reference its asset. */
export async function uploadBeforeCommand(
  prepared: PreparedRasterAsset,
  session: BoardMediaUploadSession,
  signal: AbortSignal,
): Promise<UploadedRasterResult> {
  if (signal.aborted || !session.isCurrent()) return { status: "cancelled" };
  try {
    const csrfToken = await session.getCsrfToken();
    if (signal.aborted || !session.isCurrent()) return { status: "cancelled" };
    const descriptor = await session.uploadMedia({
      body: prepared.body,
      contentSha256: prepared.contentSha256,
      csrfToken,
      documentId: session.documentId,
      fileName: prepared.fileName,
      idempotencyKey: `media:${crypto.randomUUID()}`,
      mimeType: prepared.mimeType,
      signal,
    });
    if (signal.aborted || !session.isCurrent()) return { status: "cancelled" };
    if (
      descriptor.status !== "available" ||
      descriptor.contentSha256 !== prepared.contentSha256 ||
      descriptor.byteSize !== prepared.body.size ||
      descriptor.mimeType !== prepared.mimeType ||
      descriptor.intrinsicSize.width !== prepared.intrinsicSize.width ||
      descriptor.intrinsicSize.height !== prepared.intrinsicSize.height
    ) {
      return { status: "error", message: "Сервер вернул несовместимое описание изображения." };
    }
    return { status: "ok", descriptor };
  } catch (error) {
    if (signal.aborted || !session.isCurrent()) return { status: "cancelled" };
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Не удалось загрузить изображение.",
    };
  }
}

export function createMediaAssetObject(input: {
  readonly center: Vec2;
  readonly descriptor: BoardMediaAssetDescriptor;
  readonly displaySize?: Size2 | undefined;
  readonly id: BoardObjectId;
}): MediaAssetObject {
  const { descriptor } = input;
  const size = input.displaySize ?? fitEmbeddedImageSize(descriptor.intrinsicSize);
  return {
    assetId: descriptor.assetId,
    byteSize: descriptor.byteSize,
    contentSha256: descriptor.contentSha256,
    fileName: descriptor.fileName,
    intrinsicSize: descriptor.intrinsicSize,
    mimeType: descriptor.mimeType,
    id: input.id,
    kind: "media.asset",
    groupId: null,
    locked: false,
    position: { x: input.center.x - size.width / 2, y: input.center.y - size.height / 2 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    size,
    source: { kind: "user" },
    style: { fill: null, opacity: 1, stroke: null, strokeWidth: 0 },
    visible: true,
  };
}
