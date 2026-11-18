import type { BoardObjectId } from "../board/identifiers";
import type { ViewportState } from "../board/primitives";
import {
  itemBounds,
  visibleWorldBounds,
  type BoardItemBounds,
  type BoardRenderItem,
  type BoardSceneReadModel,
  type BoardViewportSize,
} from "../board/selectors";
import type { BoardSceneDelta } from "./scene-delta";

/**
 * ICE-02B: renderer-neutral, conservative broad-phase geometry.
 *
 * These world-space envelopes are the same envelopes as the existing
 * visibility selector. They are safe for culling equivalence; exact pixel,
 * hit, pressure/eraser and transformed-geometry narrow phases remain owned
 * by the established renderer. No drawing, DOM, storage or GPU dependencies.
 */
export type SceneWorldBounds = Readonly<BoardItemBounds>;

export interface SceneDirtyItem {
  readonly id: BoardObjectId;
  readonly before: SceneWorldBounds | null;
  readonly after: SceneWorldBounds | null;
}

export interface SceneDirtyBounds {
  readonly fullInvalidation: boolean;
  readonly viewportChanged: boolean;
  readonly items: readonly SceneDirtyItem[];
}

export interface SceneSpatialIndexStats {
  readonly items: number;
  readonly buckets: number;
  readonly bucketReferences: number;
  readonly overflowItems: number;
}

export interface BoardSceneSpatialIndex {
  /** Incrementally apply a certified scene delta or safely rebuild. */
  apply(
    delta: BoardSceneDelta,
    nextScene: BoardSceneReadModel,
  ): "patch" | "rebuild" | "unchanged";
  /** Candidate objects in original BoardDocument z-order. */
  queryWorld(bounds: SceneWorldBounds): readonly BoardRenderItem[];
  queryViewport(
    viewport: ViewportState,
    size: BoardViewportSize,
  ): readonly BoardRenderItem[];
  boundsFor(id: BoardObjectId): SceneWorldBounds | null;
  stats(): SceneSpatialIndexStats;
  /** Release all object and tile references on board switch/unmount. */
  dispose(): void;
}

const cellSize = 512;
const maximumCellsPerItem = 64;
const maximumCellsPerQuery = 4_096;

interface Entry {
  readonly item: BoardRenderItem;
  readonly rank: number;
  readonly bounds: SceneWorldBounds | null;
  readonly cells: readonly string[] | null;
}

function finiteBounds(bounds: SceneWorldBounds): boolean {
  return (
    Number.isFinite(bounds.left) &&
    Number.isFinite(bounds.top) &&
    Number.isFinite(bounds.right) &&
    Number.isFinite(bounds.bottom) &&
    bounds.left <= bounds.right &&
    bounds.top <= bounds.bottom
  );
}

function safeBounds(item: BoardRenderItem): SceneWorldBounds | null {
  const bounds = itemBounds(item);
  return finiteBounds(bounds) ? bounds : null;
}

function cellKeys(
  bounds: SceneWorldBounds,
  maximum: number,
): readonly string[] | null {
  if (!finiteBounds(bounds)) return null;
  const left = Math.floor(bounds.left / cellSize);
  const right = Math.floor(bounds.right / cellSize);
  const top = Math.floor(bounds.top / cellSize);
  const bottom = Math.floor(bounds.bottom / cellSize);
  if (![left, right, top, bottom].every(Number.isSafeInteger)) return null;
  const columns = right - left + 1;
  const rows = bottom - top + 1;
  if (
    !Number.isSafeInteger(columns) ||
    !Number.isSafeInteger(rows) ||
    columns < 1 ||
    rows < 1 ||
    columns * rows > maximum
  ) {
    return null;
  }
  const keys: string[] = [];
  for (let x = left; x <= right; x += 1) {
    for (let y = top; y <= bottom; y += 1) keys.push(`${x}:${y}`);
  }
  return keys;
}

function overlaps(a: SceneWorldBounds, b: SceneWorldBounds): boolean {
  return (
    a.left <= b.right &&
    a.right >= b.left &&
    a.top <= b.bottom &&
    a.bottom >= b.top
  );
}

/** Unknown geometry requires full invalidation, never a clipped dirty tile. */
export function deriveSceneDirtyBounds(delta: BoardSceneDelta): SceneDirtyBounds {
  if (delta.kind === "reset") {
    return {
      fullInvalidation: true,
      viewportChanged: delta.viewportChanged,
      items: [],
    };
  }
  const items: SceneDirtyItem[] = [
    ...delta.added.map((item) => ({
      id: item.object.id,
      before: null,
      after: safeBounds(item),
    })),
    ...delta.removed.map((item) => ({
      id: item.object.id,
      before: safeBounds(item),
      after: null,
    })),
    ...delta.updated.map((change) => ({
      id: change.id,
      before: safeBounds(change.previous),
      after: safeBounds(change.next),
    })),
  ];
  const known = items.every((change) => {
    const hadOld = delta.removed.some(
      (item) => item.object.id === change.id,
    ) || delta.updated.some((item) => item.id === change.id);
    const hasNew = delta.added.some(
      (item) => item.object.id === change.id,
    ) || delta.updated.some((item) => item.id === change.id);
    return (!hadOld || change.before !== null) &&
      (!hasNew || change.after !== null);
  });
  return {
    fullInvalidation: !known,
    viewportChanged: delta.viewportChanged,
    items,
  };
}

/** Bounded uniform-grid broad phase with an overflow fallback for huge items. */
export function createBoardSceneSpatialIndex(
  initial: BoardSceneReadModel,
): BoardSceneSpatialIndex {
  const entries = new Map<BoardObjectId, Entry>();
  const buckets = new Map<string, Set<BoardObjectId>>();
  const overflow = new Set<BoardObjectId>();
  let order: BoardObjectId[] = [];

  function remove(id: BoardObjectId): void {
    const old = entries.get(id);
    if (old === undefined) return;
    if (old.cells === null) {
      overflow.delete(id);
    } else {
      for (const key of old.cells) {
        const bucket = buckets.get(key);
        bucket?.delete(id);
        if (bucket?.size === 0) buckets.delete(key);
      }
    }
    entries.delete(id);
  }

  function insert(item: BoardRenderItem, rank: number): void {
    const id = item.object.id;
    remove(id);
    const bounds = safeBounds(item);
    const cells =
      bounds === null ? null : cellKeys(bounds, maximumCellsPerItem);
    entries.set(id, { item, rank, bounds, cells });
    if (cells === null) {
      overflow.add(id);
    } else {
      for (const key of cells) {
        let bucket = buckets.get(key);
        if (bucket === undefined) {
          bucket = new Set<BoardObjectId>();
          buckets.set(key, bucket);
        }
        bucket.add(id);
      }
    }
  }

  function rebuild(scene: BoardSceneReadModel): void {
    entries.clear();
    buckets.clear();
    overflow.clear();
    order = [];
    scene.items.forEach((item, rank) => {
      insert(item, rank);
      order.push(item.object.id);
    });
  }

  rebuild(initial);

  return {
    apply(delta, nextScene) {
      if (delta.kind === "reset") {
        rebuild(nextScene);
        return "rebuild";
      }
      const nextIds = nextScene.items.map((item) => item.object.id);
      const prefixLength = Math.min(order.length, nextIds.length);
      if (
        order.slice(0, prefixLength).some((id, i) => id !== nextIds[i]) ||
        delta.kind === "patch" &&
          delta.changedIds.some((id) => !nextIds.includes(id) &&
            !delta.removed.some((item) => item.object.id === id))
      ) {
        rebuild(nextScene);
        return "rebuild";
      }

      if (delta.kind === "camera" || delta.kind === "noop") {
        if (
          nextScene.items.length !== entries.size ||
          nextScene.items.some((item) => entries.get(item.object.id)?.item !== item)
        ) {
          rebuild(nextScene);
          return "rebuild";
        }
        return "unchanged";
      }

      const changed = new Set(delta.changedIds);
      if (
        nextScene.items.some(
          (item) => !changed.has(item.object.id) &&
            entries.get(item.object.id)?.item !== item,
        )
      ) {
        rebuild(nextScene);
        return "rebuild";
      }
      for (const item of delta.removed) remove(item.object.id);
      for (const change of delta.updated) {
        const rank = nextIds.indexOf(change.id);
        if (rank >= 0) insert(change.next, rank);
      }
      for (const item of delta.added) {
        const rank = nextIds.indexOf(item.object.id);
        if (rank >= 0) insert(item, rank);
      }
      order = nextIds;
      if (entries.size !== nextScene.items.length) {
        rebuild(nextScene);
        return "rebuild";
      }
      return "patch";
    },

    queryWorld(bounds) {
      const keys = cellKeys(bounds, maximumCellsPerQuery);
      const candidateIds =
        keys === null
          ? new Set(entries.keys())
          : new Set<BoardObjectId>(overflow);
      if (keys !== null) {
        for (const key of keys) {
          for (const id of buckets.get(key) ?? []) candidateIds.add(id);
        }
      }
      const candidates: Entry[] = [];
      for (const id of candidateIds) {
        const entry = entries.get(id);
        if (
          entry !== undefined &&
          entry.item.object.visible &&
          (entry.bounds === null || overlaps(entry.bounds, bounds))
        ) {
          candidates.push(entry);
        }
      }
      return candidates.sort((a, b) => a.rank - b.rank).map((entry) => entry.item);
    },

    queryViewport(viewport, size) {
      return this.queryWorld(visibleWorldBounds(viewport, size));
    },

    boundsFor(id) {
      return entries.get(id)?.bounds ?? null;
    },

    stats() {
      let bucketReferences = 0;
      for (const bucket of buckets.values()) bucketReferences += bucket.size;
      return {
        items: entries.size,
        buckets: buckets.size,
        bucketReferences,
        overflowItems: overflow.size,
      };
    },

    dispose() {
      entries.clear();
      buckets.clear();
      overflow.clear();
      order = [];
    },
  };
}
