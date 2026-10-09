import type { BoardRenderItem } from "../../core/public";

/**
 * One Konva Layer redraws its whole scene canvas. Isolating contiguous GIF
 * runs keeps animation frames from repainting unrelated static pen paths.
 *
 * Runs follow the document's exact stacking order; repeated alternation
 * falls back to one layer to bound full-viewport scene/hit canvas memory.
 */
export interface CommittedPaintRun {
  readonly animated: boolean;
  readonly batches: readonly (readonly BoardRenderItem[])[];
  readonly key: string;
}

export const maximumCommittedPaintLayers = 6;
const maximumPaintBatchSize = 250;

function isAnimatedGif(item: BoardRenderItem): boolean {
  const object = item.object;
  return (
    (object.kind === "image.embedded" || object.kind === "media.asset") &&
    object.mimeType === "image/gif"
  );
}

export function partitionCommittedPaintRuns(
  batches: readonly (readonly BoardRenderItem[])[],
  maximumLayers = maximumCommittedPaintLayers,
): readonly CommittedPaintRun[] {
  if (!Number.isInteger(maximumLayers) || maximumLayers <= 0) {
    throw new RangeError("Maximum paint layers must be a positive integer.");
  }

  const fallback: CommittedPaintRun[] = [
    { animated: false, batches, key: "committed-content" },
  ];
  const items = batches.flat();
  if (items.length === 0) return fallback;

  const runs: { animated: boolean; items: BoardRenderItem[] }[] = [];
  for (const item of items) {
    const animated = isAnimatedGif(item);
    const last = runs[runs.length - 1];
    if (last === undefined || last.animated !== animated) {
      if (runs.length === maximumLayers) return fallback;
      runs.push({ animated, items: [item] });
    } else {
      last.items.push(item);
    }
  }

  // Avoid extra layers for static-only or GIF-only scenes.
  if (runs.length === 1) {
    return [{ animated: runs[0]!.animated, batches, key: "committed-content" }];
  }

  return runs.map(({ animated, items }) => {
    const paintBatches: BoardRenderItem[][] = [];
    for (let index = 0; index < items.length; index += maximumPaintBatchSize) {
      paintBatches.push(items.slice(index, index + maximumPaintBatchSize));
    }
    return {
      animated,
      batches: paintBatches,
      key: `paint:${animated ? "gif" : "static"}:${items[0]!.object.id}`,
    };
  });
}
