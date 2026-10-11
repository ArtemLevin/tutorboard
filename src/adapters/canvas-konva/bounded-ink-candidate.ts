import {
  createPenStrokeRenderBounds,
  resolveVectorInkData,
  type BoardRenderItem,
} from "../../core/public";
import { minimumWheelCacheStrokes } from "./wheel-ink-cache";
import {
  estimateInkRasterCost,
  maximumSharedInkCanvasBytes,
  maximumSharedInkScenePixels,
  type InkRasterCost,
} from "./shared-ink-raster-budget";

export interface BoundedInkCandidate {
  readonly startIndex: number;
  readonly endIndexExclusive: number;
  readonly objectIds: readonly string[];
  readonly crop: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly cost: InkRasterCost;
}

interface Box {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

const maximumCandidateStrokes = 256;
const cropPadding = 3;

function eligibleStrokeBounds(item: BoardRenderItem): Box | null {
  const stroke = item.object;
  if (
    stroke.kind !== "drawing.pen-stroke" ||
    stroke.source.kind !== "user" ||
    stroke.groupId !== null ||
    item.transforms.length !== 0 ||
    !stroke.visible ||
    stroke.rotation !== 0 ||
    stroke.scale.x !== 1 ||
    stroke.scale.y !== 1 ||
    stroke.style.fill !== null ||
    stroke.style.stroke === null ||
    stroke.style.strokeStyle !== undefined ||
    !Number.isFinite(stroke.style.strokeWidth) ||
    stroke.style.strokeWidth <= 0 ||
    !Number.isFinite(stroke.style.opacity) ||
    stroke.style.opacity <= 0 ||
    !Number.isFinite(stroke.position.x) ||
    !Number.isFinite(stroke.position.y)
  ) {
    return null;
  }
  const ink = resolveVectorInkData(stroke);
  if (ink.closed) return null;
  // This uses exactly the geometry routine behind the production pen Path.
  const bounds = createPenStrokeRenderBounds(
    ink,
    stroke.style.strokeStyle,
    stroke.style.strokeWidth,
  );
  if (bounds === null) return null;
  const translated = {
    left: stroke.position.x + bounds.left,
    right: stroke.position.x + bounds.right,
    top: stroke.position.y + bounds.top,
    bottom: stroke.position.y + bounds.bottom,
  };
  if (
    !Object.values(translated).every(Number.isFinite) ||
    translated.right < translated.left ||
    translated.bottom < translated.top
  ) {
    return null;
  }
  return translated;
}

function union(left: Box, right: Box): Box {
  return {
    left: Math.min(left.left, right.left),
    top: Math.min(left.top, right.top),
    right: Math.max(left.right, right.right),
    bottom: Math.max(left.bottom, right.bottom),
  };
}

function rasterCrop(box: Box) {
  const x = Math.floor(box.left - cropPadding);
  const y = Math.floor(box.top - cropPadding);
  return {
    x,
    y,
    width: Math.ceil(box.right + cropPadding) - x,
    height: Math.ceil(box.bottom + cropPadding) - y,
  };
}

/**
 * Read-only S5.2 feasibility selector. A run is a contiguous *slice of the
 * original draw order*, so every element before/after remains in its original
 * z-position. This planner never renders, caches or mutates Konva nodes.
 *
 * A2 must recheck the actual mounted Group.getClientRect before caching:
 * a model-space bounding proposal alone does not authorize a raster swap.
 */
export function selectBoundedInkCandidate(
  items: readonly BoardRenderItem[],
  dpr: number,
): BoundedInkCandidate | null {
  if (!Number.isFinite(dpr) || dpr < 1 || dpr > 2) return null;
  const bounds = items.map(eligibleStrokeBounds);
  let best: BoundedInkCandidate | null = null;
  // Bound the combinatorial search; the existing 10k-stroke workloads remain
  // O(N * 256) in the worst case and never allocate a stage or canvas.
  for (let start = 0; start < items.length; start += 1) {
    const first = bounds[start];
    if (first === undefined || first === null) continue;
    let box: Box = first;
    const endLimit = Math.min(items.length, start + maximumCandidateStrokes);
    for (let end = start; end < endLimit; end += 1) {
      const next = bounds[end];
      if (next === undefined || next === null) break;
      box = end === start ? box : union(box, next);
      const crop = rasterCrop(box);
      const cost = estimateInkRasterCost({
        ...crop,
        scenePixelRatio: dpr,
        hitPixelRatio: 1,
      });
      // The union cannot shrink as consecutive members are appended.
      if (
        cost === null ||
        cost.scenePixels > maximumSharedInkScenePixels ||
        cost.accountedBytes > maximumSharedInkCanvasBytes
      ) {
        break;
      }
      const count = end - start + 1;
      if (
        count >= minimumWheelCacheStrokes &&
        (best === null ||
          count > best.objectIds.length ||
          (count === best.objectIds.length &&
            cost.accountedBytes < best.cost.accountedBytes))
      ) {
        best = {
          startIndex: start,
          endIndexExclusive: end + 1,
          objectIds: items.slice(start, end + 1).map((item) => item.object.id),
          crop,
          cost,
        };
      }
    }
  }
  return best;
}
