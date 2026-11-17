import type { BoardDocument } from "../board/document";
import type { BoardObjectId } from "../board/identifiers";
import type {
  BoardRenderItem,
  BoardSceneReadModel,
} from "../board/selectors";

/**
 * Renderer-neutral, immutable changes between two validated board scenes.
 * Current ICE-02A deliberately carries original objects, not approximated
 * dirty bounds. Exact region geometry and a spatial index follow separately.
 */
export type BoardSceneDeltaKind = "reset" | "patch" | "camera" | "noop";

export type BoardSceneResetReason =
  | "initial"
  | "document-changed"
  | "order-changed"
  | "invalid-scene-order";

export interface BoardSceneItemChange {
  readonly id: BoardObjectId;
  readonly previous: BoardRenderItem;
  readonly next: BoardRenderItem;
}

export interface BoardSceneDelta {
  readonly kind: BoardSceneDeltaKind;
  readonly reason?: BoardSceneResetReason;
  /** Added items are ordered by their new document z-order. */
  readonly added: readonly BoardRenderItem[];
  /** Removed items are ordered by their previous document z-order. */
  readonly removed: readonly BoardRenderItem[];
  /** Modified items preserve their previous/new immutable references. */
  readonly updated: readonly BoardSceneItemChange[];
  /** Every affected object ID, with duplicates removed. */
  readonly changedIds: readonly BoardObjectId[];
  readonly viewportChanged: boolean;
}

export interface DeriveBoardSceneDeltaInput {
  readonly previousDocument: BoardDocument | null;
  readonly previousScene: BoardSceneReadModel | null;
  readonly nextDocument: BoardDocument;
  readonly nextScene: BoardSceneReadModel;
}

function viewportChanged(
  previous: BoardDocument["viewport"],
  next: BoardDocument["viewport"],
): boolean {
  return (
    previous.zoom !== next.zoom ||
    previous.offset.x !== next.offset.x ||
    previous.offset.y !== next.offset.y
  );
}

function matchesDocumentOrder(
  document: BoardDocument,
  scene: BoardSceneReadModel,
): boolean {
  return (
    scene.items.length === document.order.length &&
    scene.items.every((item, index) => item.object.id === document.order[index])
  );
}

/**
 * A tail append or tail removal preserves the order of every surviving item.
 * Reordering, deleting from the middle or inserting between interleaved media
 * requires a full renderer rebuild until exact dirty z-runs are available.
 */
function tailEditOnly(
  before: readonly BoardObjectId[],
  after: readonly BoardObjectId[],
): boolean {
  const length = Math.min(before.length, after.length);
  for (let index = 0; index < length; index += 1) {
    if (before[index] !== after[index]) return false;
  }
  return true;
}

function reset(
  reason: BoardSceneResetReason,
  previousScene: BoardSceneReadModel | null,
  nextScene: BoardSceneReadModel,
  cameraChanged: boolean,
): BoardSceneDelta {
  const removed = previousScene?.items ?? [];
  const added = nextScene.items;
  return {
    kind: "reset",
    reason,
    removed,
    added,
    updated: [],
    changedIds: [
      ...new Set<BoardObjectId>([
        ...removed.map((item) => item.object.id),
        ...added.map((item) => item.object.id),
      ]),
    ],
    viewportChanged: cameraChanged,
  };
}

function empty(
  kind: "noop" | "camera",
  cameraChanged: boolean,
): BoardSceneDelta {
  return {
    kind,
    added: [],
    removed: [],
    updated: [],
    changedIds: [],
    viewportChanged: cameraChanged,
  };
}

/**
 * Produces a conservative transient delta for a renderer adapter.
 *
 * Preconditions: documents have passed normal core validation, snapshots are
 * immutable, and scenes originate from the corresponding document. The
 * function never validates/repairs untrusted documents itself.
 *
 * Reuse certified immutable content records/order to avoid rebuilding
 * geometry. This first implementation still checks ordered item identity
 * and therefore performs an O(N) scan over the scene.
 */
export function deriveBoardSceneDelta({
  previousDocument,
  previousScene,
  nextDocument,
  nextScene,
}: DeriveBoardSceneDeltaInput): BoardSceneDelta {
  if (previousDocument === null || previousScene === null) {
    return reset("initial", null, nextScene, true);
  }

  const cameraChanged = viewportChanged(
    previousDocument.viewport,
    nextDocument.viewport,
  );
  if (previousDocument.id !== nextDocument.id) {
    return reset("document-changed", previousScene, nextScene, cameraChanged);
  }

  // The next read model must agree with the authoritative document ordering.
  // If it does not, fail safely to a full rebuild in the consuming adapter.
  if (
    !matchesDocumentOrder(previousDocument, previousScene) ||
    !matchesDocumentOrder(nextDocument, nextScene)
  ) {
    return reset(
      "invalid-scene-order",
      previousScene,
      nextScene,
      cameraChanged,
    );
  }

  if (
    previousDocument.objects === nextDocument.objects &&
    previousDocument.groups === nextDocument.groups &&
    previousDocument.geometryImports === nextDocument.geometryImports &&
    previousDocument.order === nextDocument.order
  ) {
    return empty(cameraChanged ? "camera" : "noop", cameraChanged);
  }

  if (!tailEditOnly(previousDocument.order, nextDocument.order)) {
    return reset("order-changed", previousScene, nextScene, cameraChanged);
  }

  const oldItems = new Map(
    previousScene.items.map((item) => [item.object.id, item] as const),
  );
  const newItems = new Map(
    nextScene.items.map((item) => [item.object.id, item] as const),
  );
  const added: BoardRenderItem[] = [];
  const removed: BoardRenderItem[] = [];
  const updated: BoardSceneItemChange[] = [];

  for (const item of nextScene.items) {
    const previous = oldItems.get(item.object.id);
    if (previous === undefined) {
      added.push(item);
    } else if (previous !== item) {
      updated.push({ id: item.object.id, previous, next: item });
    }
  }
  for (const item of previousScene.items) {
    if (!newItems.has(item.object.id)) removed.push(item);
  }

  if (added.length === 0 && removed.length === 0 && updated.length === 0) {
    return empty(cameraChanged ? "camera" : "noop", cameraChanged);
  }

  return {
    kind: "patch",
    added,
    removed,
    updated,
    changedIds: [
      ...added.map((item) => item.object.id),
      ...removed.map((item) => item.object.id),
      ...updated.map((change) => change.id),
    ],
    viewportChanged: cameraChanged,
  };
}
