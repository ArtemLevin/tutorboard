import type {
  BoardDocument,
  BoardObjectId,
  CommandMetadata,
  DeleteObjectsCommand,
  GroupId,
  MoveSelectionCommand,
  ReplaceObjectsCommand,
  SetSelectionLockCommand,
  Vec2,
} from "../../core/public";

export interface ResolvedSelectionTargets {
  readonly groupIds: readonly GroupId[];
  readonly objectIds: readonly BoardObjectId[];
}

export interface SelectionObjectTransform {
  readonly objectId: BoardObjectId;
  readonly position: Vec2;
  readonly rotation: number;
  readonly scale: Vec2;
}

export function expandSelectionObjectIds(
  document: BoardDocument,
  objectIds: readonly BoardObjectId[],
): readonly BoardObjectId[] {
  const expanded = new Set<BoardObjectId>();
  for (const objectId of objectIds) {
    const object = document.objects[objectId];
    if (object?.groupId === null || object === undefined) {
      if (object !== undefined) {
        expanded.add(objectId);
      }
      continue;
    }
    const group = document.groups[object.groupId];
    for (const memberId of group?.objectIds ?? [objectId]) {
      expanded.add(memberId);
    }
  }
  return document.order.filter((id) => expanded.has(id));
}

export function resolveSelectionTargets(
  document: BoardDocument,
  objectIds: readonly BoardObjectId[],
): ResolvedSelectionTargets {
  const groupIds = new Set<GroupId>();
  const independentObjectIds = new Set<BoardObjectId>();
  for (const objectId of objectIds) {
    const object = document.objects[objectId];
    if (object === undefined) {
      continue;
    }
    if (object.groupId === null) {
      independentObjectIds.add(objectId);
    } else {
      groupIds.add(object.groupId);
    }
  }
  return {
    groupIds: [...groupIds],
    objectIds: document.order.filter((id) => independentObjectIds.has(id)),
  };
}

export function selectionIsLocked(
  document: BoardDocument,
  objectIds: readonly BoardObjectId[],
): boolean {
  const targets = resolveSelectionTargets(document, objectIds);
  return (
    targets.objectIds.some((id) => document.objects[id]?.locked === true) ||
    targets.groupIds.some((id) => {
      const group = document.groups[id];
      return (
        group?.locked === true ||
        group?.objectIds.some(
          (objectId) => document.objects[objectId]?.locked === true,
        ) === true
      );
    })
  );
}

export function createMoveSelectionCommand(
  metadata: CommandMetadata,
  document: BoardDocument,
  objectIds: readonly BoardObjectId[],
  delta: Vec2,
): MoveSelectionCommand {
  return {
    ...metadata,
    ...resolveSelectionTargets(document, objectIds),
    delta,
    kind: "core.selection.move",
  };
}

function normalizeRotation(rotation: number): number {
  const normalized = ((((rotation + 180) % 360) + 360) % 360) - 180;
  return Object.is(normalized, -0) ? 0 : normalized;
}

export function createTransformSelectionCommand(
  metadata: CommandMetadata,
  document: BoardDocument,
  transforms: readonly SelectionObjectTransform[],
): ReplaceObjectsCommand {
  if (transforms.length === 0) {
    throw new RangeError("Selection transform requires at least one object.");
  }

  const ids = transforms.map(({ objectId }) => objectId);
  if (new Set(ids).size !== ids.length) {
    throw new TypeError("Selection transform contains duplicate object IDs.");
  }

  const originals = transforms.map(({ objectId }) => {
    const object = document.objects[objectId];
    if (object === undefined) {
      throw new TypeError(
        `Selection transform references missing object ${objectId}.`,
      );
    }
    if (
      object.locked ||
      object.groupId !== null ||
      object.source.kind !== "user"
    ) {
      throw new TypeError(
        "Only unlocked, ungrouped user objects can be transformed.",
      );
    }
    return object;
  });

  const replacements = originals.map((object, index) => {
    const transform = transforms[index];
    if (
      transform === undefined ||
      !Number.isFinite(transform.position.x) ||
      !Number.isFinite(transform.position.y) ||
      !Number.isFinite(transform.rotation) ||
      !Number.isFinite(transform.scale.x) ||
      !Number.isFinite(transform.scale.y) ||
      transform.scale.x <= 0 ||
      transform.scale.y <= 0
    ) {
      throw new TypeError(
        "Selection transform values must be finite and positive.",
      );
    }
    return {
      ...object,
      position: transform.position,
      rotation: normalizeRotation(transform.rotation),
      scale: transform.scale,
    };
  });

  return {
    ...metadata,
    kind: "core.objects.replace",
    originals,
    replacements,
  };
}

export function createSetSelectionLockCommand(
  metadata: CommandMetadata,
  document: BoardDocument,
  objectIds: readonly BoardObjectId[],
  locked: boolean,
): SetSelectionLockCommand {
  return {
    ...metadata,
    ...resolveSelectionTargets(document, objectIds),
    kind: "core.selection.set-lock",
    locked,
  };
}

export function createDeleteSelectionCommand(
  metadata: CommandMetadata,
  document: BoardDocument,
  objectIds: readonly BoardObjectId[],
): DeleteObjectsCommand {
  return {
    ...metadata,
    kind: "core.objects.delete",
    objectIds: expandSelectionObjectIds(document, objectIds),
  };
}
