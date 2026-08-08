import {
  commandId,
  type ActorId,
  type BoardCommand,
  type BoardDocument,
  type BoardObject,
} from "../../core/public";

export interface CollaborativeUndoMetadata {
  readonly actorId: ActorId;
  readonly createId: () => string;
  readonly now: () => string;
}

function metadata(input: CollaborativeUndoMetadata) {
  return {
    actorId: input.actorId,
    id: commandId(input.createId()),
    timestamp: input.now(),
  };
}

function objects(
  document: BoardDocument,
  ids: readonly string[],
): readonly BoardObject[] {
  return ids.flatMap((id) => {
    const object = document.objects[id as keyof typeof document.objects];
    return object === undefined ? [] : [object];
  });
}

export function invertOwnBoardCommand(
  command: BoardCommand,
  before: BoardDocument,
  input: CollaborativeUndoMetadata,
): readonly BoardCommand[] {
  const meta = () => metadata(input);
  switch (command.kind) {
    case "core.objects.add":
      return [
        {
          ...meta(),
          kind: "core.objects.delete",
          objectIds: command.objects.map(({ id }) => id),
        },
      ];
    case "core.objects.replace":
      return [
        {
          ...meta(),
          kind: command.kind,
          originals: command.replacements,
          replacements: command.originals,
        },
      ];
    case "core.coordinate-plot.update":
      return [
        {
          ...meta(),
          expected: command.replacement,
          kind: command.kind,
          objectId: command.objectId,
          replacement: command.expected,
        },
      ];
    case "core.objects.delete": {
      const deleted = objects(before, command.objectIds);
      if (
        deleted.length !== command.objectIds.length ||
        deleted.some(({ groupId }) => groupId !== null)
      ) {
        return [];
      }
      return deleted
        .map((object) => ({
          index: before.order.indexOf(object.id),
          object,
        }))
        .sort((left, right) => left.index - right.index)
        .map(({ index, object }): BoardCommand => ({
          ...meta(),
          atIndex: index,
          kind: "core.objects.add",
          objects: [object],
        }));
    }
    case "core.objects.move":
      return [
        {
          ...meta(),
          delta: { x: -command.delta.x, y: -command.delta.y },
          kind: command.kind,
          objectIds: command.objectIds,
        },
      ];
    case "core.groups.move":
      return [
        {
          ...meta(),
          delta: { x: -command.delta.x, y: -command.delta.y },
          groupId: command.groupId,
          kind: command.kind,
        },
      ];
    case "core.groups.set-transform": {
      const group = before.groups[command.groupId];
      return group === undefined
        ? []
        : [
            {
              ...meta(),
              groupId: command.groupId,
              kind: command.kind,
              transform: group.transform,
            },
          ];
    }
    case "core.selection.move":
      return [
        {
          ...meta(),
          delta: { x: -command.delta.x, y: -command.delta.y },
          groupIds: command.groupIds,
          kind: command.kind,
          objectIds: command.objectIds,
        },
      ];
    case "core.geometry.translate":
      return [
        {
          ...meta(),
          delta: { x: -command.delta.x, y: -command.delta.y },
          importId: command.importId,
          kind: command.kind,
        },
      ];
    case "core.geometry.label-offset":
      return [
        {
          ...meta(),
          delta: { x: -command.delta.x, y: -command.delta.y },
          importId: command.importId,
          kind: command.kind,
          objectId: command.objectId,
        },
      ];
    case "core.document.rename":
      return [
        {
          ...meta(),
          kind: command.kind,
          title: before.title,
        },
      ];
    case "core.text.update": {
      const object = before.objects[command.objectId];
      return object?.kind === "drawing.text"
        ? [
            {
              ...meta(),
              kind: command.kind,
              objectId: command.objectId,
              text: object.text,
            },
          ]
        : [];
    }
    case "core.viewport.set":
      return [
        {
          ...meta(),
          kind: command.kind,
          viewport: before.viewport,
        },
      ];
    case "core.groups.add":
      return [
        {
          ...meta(),
          groupIds: [command.group.id],
          kind: "core.groups.remove",
        },
      ];
    case "core.groups.remove":
      return command.groupIds.flatMap((id) => {
        const group = before.groups[id];
        return group === undefined
          ? []
          : [{ ...meta(), group, kind: "core.groups.add" as const }];
      });
    case "core.geometry.import":
      return [
        {
          ...meta(),
          geometryImportIds: [command.importRecord.id],
          groupIds: [command.group.id],
          kind: "core.clipboard.cut",
          objectIds: command.objects.map(({ id }) => id),
        },
      ];
    case "core.clipboard.paste":
      if ((command.solidModels?.length ?? 0) > 0) return [];
      return [
        {
          ...meta(),
          geometryImportIds: command.geometryImports.map(({ id }) => id),
          groupIds: command.groups.map(({ id }) => id),
          kind: "core.clipboard.cut",
          objectIds: command.objects.map(({ id }) => id),
        },
      ];
    case "core.layers.reorder":
      if (command.mode !== "forward" && command.mode !== "backward") {
        return [];
      }
      return [
        {
          ...meta(),
          kind: command.kind,
          mode: command.mode === "forward" ? "backward" : "forward",
          objectIds: command.objectIds,
        },
      ];
    case "core.layers.set-visibility": {
      const selected = objects(before, command.objectIds);
      const previous = selected[0]?.visible;
      return previous !== undefined &&
        selected.length === command.objectIds.length &&
        selected.every(({ visible }) => visible === previous)
        ? [
            {
              ...meta(),
              kind: command.kind,
              objectIds: command.objectIds,
              visible: previous,
            },
          ]
        : [];
    }
    case "core.selection.set-lock": {
      const objectValues = objects(before, command.objectIds).map(
        ({ locked }) => locked,
      );
      const groupValues = command.groupIds.flatMap((id) => {
        const group = before.groups[id];
        return group === undefined ? [] : [group.locked];
      });
      const values = [...objectValues, ...groupValues];
      const previous = values[0];
      return previous !== undefined &&
        objectValues.length === command.objectIds.length &&
        groupValues.length === command.groupIds.length &&
        values.every((value) => value === previous)
        ? [
            {
              ...meta(),
              groupIds: command.groupIds,
              kind: command.kind,
              locked: previous,
              objectIds: command.objectIds,
            },
          ]
        : [];
    }
    case "core.clipboard.cut":
    case "core.geometry.style-override":
    case "core.selection.set-style":
    case "core.solid-3d.create":
    case "core.solid-3d.project-section":
      return [];
    case "core.solid-3d.update":
      return [
        {
          ...meta(),
          expected: command.replacement,
          kind: command.kind,
          replacement: command.expected,
          solidId: command.solidId,
        },
      ];
  }
}
