import type {
  BoardDocument,
  EmbeddedImageObject,
  MediaAssetObject,
} from "../../core/public";

/**
 * Produce an export-only document. The live document/command journal are never
 * mutated or serialized with inline bytes. Always resolve media with the
 * current authenticated board repository (no cross-tenant or raw S3 URLs).
 */
export type BoardSnapshotMediaLoader = (asset: MediaAssetObject) => Promise<Blob>;

const maxSnapshotAssetBytes = 32 * 1024 * 1024;
const maxSnapshotTotalBytes = 128 * 1024 * 1024;
const rasterMimeTypes = new Set(["image/png", "image/jpeg", "image/gif"]);

function base64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 16_384) {
    chunks.push(
      String.fromCharCode(...bytes.subarray(offset, offset + 16_384)),
    );
  }
  return btoa(chunks.join(""));
}

function embeddedCopy(
  asset: MediaAssetObject,
  dataUrl: string,
): EmbeddedImageObject {
  return {
    contentSha256: asset.contentSha256,
    dataUrl,
    fileName: asset.fileName,
    groupId: asset.groupId,
    id: asset.id,
    intrinsicSize: asset.intrinsicSize,
    kind: "image.embedded",
    locked: asset.locked,
    mimeType: asset.mimeType as EmbeddedImageObject["mimeType"],
    position: asset.position,
    rotation: asset.rotation,
    scale: asset.scale,
    size: asset.size,
    source: asset.source,
    style: asset.style,
    visible: asset.visible,
  };
}

export async function embedBoardMediaForSnapshot(
  document: BoardDocument,
  load: BoardSnapshotMediaLoader | undefined,
): Promise<BoardDocument> {
  const assets = Object.values(document.objects).filter(
    (object): object is MediaAssetObject =>
      object !== undefined && object.kind === "media.asset" && object.visible,
  );
  if (assets.length === 0) return document;
  if (load === undefined) {
    throw new Error(
      "Снимок содержит серверные изображения. Для экспорта необходимо подключение к доске.",
    );
  }

  let totalBytes = 0;
  const cached = new Map<string, string>();
  const objects = { ...document.objects };
  for (const asset of assets) {
    if (!rasterMimeTypes.has(asset.mimeType)) {
      throw new Error("Этот тип медиа пока нельзя включить в статический снимок.");
    }
    const key = asset.assetId + ":" + asset.contentSha256;
    let dataUrl = cached.get(key);
    if (dataUrl === undefined) {
      if (
        asset.byteSize < 1 ||
        asset.byteSize > maxSnapshotAssetBytes ||
        totalBytes + asset.byteSize > maxSnapshotTotalBytes
      ) {
        throw new Error("Размер изображений превышает лимит экспорта 128 МиБ.");
      }
      const blob = await load(asset);
      if (blob.type !== asset.mimeType || blob.size !== asset.byteSize) {
        throw new Error("Сервер вернул изображение с неверным типом или размером.");
      }
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
      const actualSha = [...digest]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join("");
      if (actualSha !== asset.contentSha256) {
        throw new Error("Контрольная сумма изображения не совпадает с оригиналом.");
      }
      dataUrl = "data:" + asset.mimeType + ";base64," + base64(bytes);
      cached.set(key, dataUrl);
      totalBytes += blob.size;
    }
    objects[asset.id] = embeddedCopy(asset, dataUrl);
  }
  return { ...document, objects };
}
