import {
  identityTransform,
  type AddGroupCommand,
  type BoardDocument,
  type BoardObjectId,
  type CommandMetadata,
  type GroupId,
  type LayerReorderMode,
  type RemoveGroupsCommand,
  type ReorderLayersCommand,
  type SetLayerVisibilityCommand,
} from "../../core/public";

export interface LayerItem {
  readonly groupId: GroupId | null;
  readonly id: BoardObjectId;
  readonly kind: string;
  readonly locked: boolean;
  readonly visible: boolean;
}

export function selectLayers(document: BoardDocument): readonly LayerItem[] {
  return [...document.order].reverse().flatMap((id) => {
    const object = document.objects[id];
    return object === undefined
      ? []
      : [
          {
            groupId: object.groupId,
            id: object.id,
            kind: object.kind,
            locked:
              object.locked ||
              (object.groupId !== null &&
                document.groups[object.groupId]?.locked === true),
            visible: object.visible,
          },
        ];
  });
}

export function createReorderLayersCommand(
  metadata: CommandMetadata,
  objectIds: readonly BoardObjectId[],
  mode: LayerReorderMode,
): ReorderLayersCommand {
  return { ...metadata, kind: "core.layers.reorder", mode, objectIds };
}

export function createSetLayerVisibilityCommand(
  metadata: CommandMetadata,
  objectIds: readonly BoardObjectId[],
  visible: boolean,
): SetLayerVisibilityCommand {
  return {
    ...metadata,
    kind: "core.layers.set-visibility",
    objectIds,
    visible,
  };
}

export function createGroupSelectionCommand(
  metadata: CommandMetadata,
  id: GroupId,
  objectIds: readonly BoardObjectId[],
): AddGroupCommand {
  return {
    ...metadata,
    group: {
      id,
      locked: false,
      objectIds,
      transform: identityTransform,
    },
    kind: "core.groups.add",
  };
}

export function createUngroupSelectionCommand(
  metadata: CommandMetadata,
  document: BoardDocument,
  objectIds: readonly BoardObjectId[],
): RemoveGroupsCommand {
  return {
    ...metadata,
    groupIds: [
      ...new Set(
        objectIds.flatMap((id) => {
          const groupId = document.objects[id]?.groupId;
          return groupId === null || groupId === undefined ? [] : [groupId];
        }),
      ),
    ].sort(),
    kind: "core.groups.remove",
  };
}
