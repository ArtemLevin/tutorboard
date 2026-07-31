import type {
  BoardObjectId,
  EmbeddedImageMimeType,
  EmbeddedImageObject,
  Size2,
  Vec2,
} from "../core/public";
import { sanitizeSvg } from "../modules/svg-import/public";

export const embeddedImageImportLimits = {
  maxBatchBytes: 24 * 1024 * 1024,
  maxDimension: 16_384,
  maxFileBytes: 8 * 1024 * 1024,
  maxFilesPerBatch: 12,
  maxPixels: 64_000_000,
  maximumDisplay: { height: 480, width: 720 },
  minimumDisplaySide: 96,
} as const;

export const embeddedImageAccept =
  ".png,.jpeg,.jpg,.svg,.gif,image/png,image/jpeg,image/svg+xml,image/gif";

export interface PreparedEmbeddedImage {
  readonly contentSha256: string;
  readonly dataUrl: string;
  readonly fileName: string;
  readonly intrinsicSize: Size2;
  readonly mimeType: EmbeddedImageMimeType;
  readonly size: Size2;
}

export type PrepareEmbeddedImageResult =
  | { readonly status: "ok"; readonly value: PreparedEmbeddedImage }
  | {
      readonly code: string;
      readonly message: string;
      readonly status: "error";
    };

function error(code: string, message: string): PrepareEmbeddedImageResult {
  return { code, message, status: "error" };
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function arrayBufferBytes(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy;
}

export function imageMimeFromBytes(
  bytes: Uint8Array,
  textPrefix = "",
): EmbeddedImageMimeType | null {
  if (startsWith(bytes, [137, 80, 78, 71, 13, 10, 26, 10])) {
    return "image/png";
  }
  if (startsWith(bytes, [255, 216, 255])) {
    return "image/jpeg";
  }
  if (
    startsWith(bytes, [71, 73, 70, 56, 55, 97]) ||
    startsWith(bytes, [71, 73, 70, 56, 57, 97])
  ) {
    return "image/gif";
  }
  const normalized = textPrefix.replace(/^\uFEFF/u, "").trimStart();
  if (/^(?:<\?xml[^>]*>\s*)?<svg(?:\s|>)/iu.test(normalized)) {
    return "image/svg+xml";
  }
  return null;
}

export function isSupportedEmbeddedImageCandidate(file: File): boolean {
  return (
    ["image/png", "image/jpeg", "image/svg+xml", "image/gif"].includes(
      file.type.toLowerCase(),
    ) || /\.(?:png|jpe?g|svg|gif)$/iu.test(file.name)
  );
}

export function fitEmbeddedImageSize(intrinsic: Size2): Size2 {
  const { maximumDisplay, minimumDisplaySide } = embeddedImageImportLimits;
  const maxScale = Math.min(
    maximumDisplay.width / intrinsic.width,
    maximumDisplay.height / intrinsic.height,
  );
  const desiredScale = Math.max(
    1,
    minimumDisplaySide / Math.min(intrinsic.width, intrinsic.height),
  );
  const scale = Math.min(maxScale, desiredScale);
  return {
    height: Math.max(1, intrinsic.height * scale),
    width: Math.max(1, intrinsic.width * scale),
  };
}

function safeFileName(value: string): string {
  const leaf = value.split(/[\\/]/u).at(-1) ?? "";
  const printable = [...leaf]
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join("")
    .trim()
    .slice(0, 256);
  return printable.length > 0 ? printable : "image";
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("image.read-failed"));
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("image.read-failed"));
    reader.readAsDataURL(blob);
  });
}

function decodeImage(dataUrl: string): Promise<Size2> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onerror = () => reject(new Error("image.decode-failed"));
    image.onload = () =>
      resolve({ height: image.naturalHeight, width: image.naturalWidth });
    image.src = dataUrl;
  });
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", arrayBufferBytes(bytes));
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function validIntrinsicSize(size: Size2): boolean {
  return (
    Number.isFinite(size.width) &&
    Number.isFinite(size.height) &&
    size.width > 0 &&
    size.height > 0 &&
    size.width <= embeddedImageImportLimits.maxDimension &&
    size.height <= embeddedImageImportLimits.maxDimension &&
    size.width * size.height <= embeddedImageImportLimits.maxPixels
  );
}

export async function prepareEmbeddedImageFile(
  file: File,
): Promise<PrepareEmbeddedImageResult> {
  if (file.size <= 0) {
    return error("image.empty-file", "Файл изображения пуст.");
  }
  if (file.size > embeddedImageImportLimits.maxFileBytes) {
    return error(
      "image.input-too-large",
      "Размер одного изображения превышает 8 МБ.",
    );
  }

  let originalBytes: Uint8Array;
  try {
    originalBytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return error("image.read-failed", "Не удалось прочитать изображение.");
  }
  const textPrefix = new TextDecoder().decode(
    originalBytes.subarray(0, Math.min(originalBytes.length, 4096)),
  );
  const mimeType = imageMimeFromBytes(originalBytes, textPrefix);
  if (mimeType === null) {
    return error(
      "image.unsupported-format",
      "Поддерживаются PNG, JPEG/JPG, SVG и GIF.",
    );
  }

  let bytes = originalBytes;
  let intrinsicSize: Size2;
  if (mimeType === "image/svg+xml") {
    const source = new TextDecoder().decode(originalBytes);
    const sanitized = sanitizeSvg(source);
    if (sanitized.status === "error") {
      return error(
        sanitized.diagnostic.code,
        "SVG содержит небезопасные или неподдерживаемые данные.",
      );
    }
    bytes = new TextEncoder().encode(sanitized.value.sanitizedSvg);
    intrinsicSize = sanitized.value.size;
  } else {
    let temporaryDataUrl: string;
    try {
      temporaryDataUrl = await readAsDataUrl(
        new Blob([arrayBufferBytes(bytes)], { type: mimeType }),
      );
      intrinsicSize = await decodeImage(temporaryDataUrl);
    } catch {
      return error(
        "image.decode-failed",
        "Файл повреждён или браузер не смог его декодировать.",
      );
    }
  }

  if (!validIntrinsicSize(intrinsicSize)) {
    return error(
      "image.dimension-limit-exceeded",
      "Размеры изображения превышают допустимый предел.",
    );
  }

  const dataUrl = await readAsDataUrl(
    new Blob([arrayBufferBytes(bytes)], { type: mimeType }),
  );
  return {
    status: "ok",
    value: {
      contentSha256: await sha256(bytes),
      dataUrl,
      fileName: safeFileName(file.name),
      intrinsicSize,
      mimeType,
      size: fitEmbeddedImageSize(intrinsicSize),
    },
  };
}

export function createEmbeddedImageObject(input: {
  readonly center: Vec2;
  readonly id: BoardObjectId;
  readonly prepared: PreparedEmbeddedImage;
}): EmbeddedImageObject {
  return {
    contentSha256: input.prepared.contentSha256,
    dataUrl: input.prepared.dataUrl,
    fileName: input.prepared.fileName,
    groupId: null,
    id: input.id,
    intrinsicSize: input.prepared.intrinsicSize,
    kind: "image.embedded",
    locked: false,
    mimeType: input.prepared.mimeType,
    position: {
      x: input.center.x - input.prepared.size.width / 2,
      y: input.center.y - input.prepared.size.height / 2,
    },
    rotation: 0,
    scale: { x: 1, y: 1 },
    size: input.prepared.size,
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
