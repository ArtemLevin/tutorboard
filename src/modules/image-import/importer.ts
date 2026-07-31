import type {
  AddObjectsCommand,
  BoardObjectId,
  CommandMetadata,
  ImageObject,
  Size2,
  Vec2,
} from "../../core/public";

export const imageImportLimits = {
  maxFileBytes: 8 * 1024 * 1024,
  maxDimension: 16_384,
  maxInitialWidth: 720,
  maxInitialHeight: 520,
} as const;

export const supportedImageMimeTypes = [
  "image/png",
  "image/jpeg",
  "image/gif",
] as const;

export type SupportedImageMimeType = (typeof supportedImageMimeTypes)[number];

export type CreateImageObjectResult =
  | { readonly object: ImageObject; readonly status: "ok" }
  | {
      readonly code: string;
      readonly message: string;
      readonly status: "error";
    };

function fittedSize(source: Size2): Size2 {
  const ratio = Math.min(
    1,
    imageImportLimits.maxInitialWidth / source.width,
    imageImportLimits.maxInitialHeight / source.height,
  );
  return {
    width: Math.max(1, source.width * ratio),
    height: Math.max(1, source.height * ratio),
  };
}

export function isSupportedRasterImage(file: File): boolean {
  return supportedImageMimeTypes.includes(file.type as SupportedImageMimeType);
}

export function createImageObject(input: {
  readonly center: Vec2;
  readonly dataUrl: string;
  readonly id: BoardObjectId;
  readonly mimeType: SupportedImageMimeType;
  readonly naturalSize: Size2;
  readonly name: string;
}): CreateImageObjectResult {
  if (
    !Number.isFinite(input.naturalSize.width) ||
    !Number.isFinite(input.naturalSize.height) ||
    input.naturalSize.width <= 0 ||
    input.naturalSize.height <= 0 ||
    input.naturalSize.width > imageImportLimits.maxDimension ||
    input.naturalSize.height > imageImportLimits.maxDimension
  ) {
    return {
      code: "image.invalid-dimensions",
      message: "Размер изображения не поддерживается.",
      status: "error",
    };
  }
  const size = fittedSize(input.naturalSize);
  return {
    status: "ok",
    object: {
      dataUrl: input.dataUrl,
      groupId: null,
      id: input.id,
      kind: "media.image",
      locked: false,
      mimeType: input.mimeType,
      name: input.name.slice(0, 256),
      naturalSize: input.naturalSize,
      position: {
        x: input.center.x - size.width / 2,
        y: input.center.y - size.height / 2,
      },
      rotation: 0,
      scale: { x: 1, y: 1 },
      size,
      source: { kind: "user" },
      style: { fill: null, opacity: 1, stroke: null, strokeWidth: 0 },
      visible: true,
    },
  };
}

export function createAddImageObjectCommand(
  metadata: CommandMetadata,
  object: ImageObject,
): AddObjectsCommand {
  return { ...metadata, kind: "core.objects.add", objects: [object] };
}
