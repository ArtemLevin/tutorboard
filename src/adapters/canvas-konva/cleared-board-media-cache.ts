import type { BoardDocument } from "../../core/public";
import { rasterDecodeCache } from "./raster-decode-cache";

/**
 * Retire bitmap decodes owned by the document being emptied.
 *
 * A clear command can commit before React unmounts the previous Konva scene.
 * discardSourceWhenUnused() marks still-leased images for release after their
 * final consumer unmounts, while immediately closing unreferenced bitmaps.
 * It never closes a bitmap currently used by another board.
 *
 * Only embedded images are handled here: asset-backed media is retired by the
 * per-canvas renderer registry when the old scene is disposed.
 */
export function discardClearedBoardEmbeddedImages(
  document: Pick<BoardDocument, "order" | "objects">,
  cache: Pick<
    typeof rasterDecodeCache,
    "discardSourceWhenUnused"
  > = rasterDecodeCache,
): void {
  for (const id of document.order) {
    const object = document.objects[id];
    if (object?.kind !== "image.embedded") continue;
    cache.discardSourceWhenUnused(object.dataUrl);
  }
}
