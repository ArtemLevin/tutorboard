import type {
  BoardDocument,
  BoardObjectId,
  CommandMetadata,
  DeleteObjectsCommand,
  GroupId,
  MoveSelectionCommand,
  SetSelectionLockCommand,
  Vec2,
} from "../../core/public";

export interface ResolvedSelectionTargets {
  readonly groupIds: readonly GroupId[];
  readonly objectIds: readonly BoardObjectId[];
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
