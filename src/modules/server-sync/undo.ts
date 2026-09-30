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

function invertBatchObjectChanges(
  command: Extract<
    BoardCommand,
    { readonly kind: "core.objects.batch-replace" }
  >,
  before: BoardDocument,
) {
  const removedIds = new Set(
    command.changes.flatMap(({ originals }) => originals.map(({ id }) => id)),
  );
  const changesByIndex = new Map(
    command.changes.map((change, index) => [change.atIndex, { change, index }]),
  );
  const postIndexes = new Array<number>(command.changes.length);
  let postIndex = 0;

  for (let index = 0; index <= before.order.length; index += 1) {
    const entry = changesByIndex.get(index);
    if (entry !== undefined) {
      postIndexes[entry.index] = postIndex;
      postIndex += entry.change.replacements.length;
    }
    const objectId = before.order[index];
    if (objectId !== undefined && !removedIds.has(objectId)) {
      postIndex += 1;
    }
  }

  const inverse = command.changes
    .map((change, index) => ({
      atIndex: postIndexes[index]!,
      originalAtIndex: change.atIndex,
      originals: change.replacements,
      replacements: change.originals,
    }))
    .sort(
      (left, right) =>
        left.atIndex - right.atIndex ||
        left.originalAtIndex - right.originalAtIndex,
    );

  return inverse.reduce<
    {
      readonly atIndex: number;
      readonly originals: readonly BoardObject[];
      readonly replacements: readonly BoardObject[];
    }[]
  >((changes, change) => {
    const previous = changes.at(-1);
    if (previous === undefined || previous.atIndex !== change.atIndex) {
      changes.push({
        atIndex: change.atIndex,
        originals: change.originals,
        replacements: change.replacements,
      });
      return changes;
    }
    changes[changes.length - 1] = {
      atIndex: previous.atIndex,
      originals: [...previous.originals, ...change.originals],
      replacements: [...previous.replacements, ...change.replacements],
    };
    return changes;
  }, []);
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
    case "core.objects.batch-replace":
      return [
        {
          ...meta(),
          changes: invertBatchObjectChanges(command, before),
          kind: command.kind,
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
    case "core.clipboard.cut": {
      const cutObjects = objects(before, command.objectIds);
      const groups = command.groupIds.flatMap((id) => {
        const group = before.groups[id];
        return group === undefined ? [] : [group];
      });
      const geometryImports = command.geometryImportIds.flatMap((id) => {
        const record = before.geometryImports[id];
        return record === undefined ? [] : [record];
      });
      const solidModels = (command.solidIds ?? []).flatMap((id) => {
        const record = before.solidModels[id];
        return record === undefined ? [] : [record];
      });
      if (
        cutObjects.length !== command.objectIds.length ||
        groups.length !== command.groupIds.length ||
        geometryImports.length !== command.geometryImportIds.length ||
        solidModels.length !== (command.solidIds?.length ?? 0)
      ) {
        return [];
      }
      return [
        {
          ...meta(),
          geometryImports,
          groups,
          kind: "core.clipboard.paste",
          objects: cutObjects,
          ...(solidModels.length === 0 ? {} : { solidModels }),
        },
      ];
    }
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
    case "core.solid-3d-learning.start":
      return [
        {
          ...meta(),
          attemptId: command.attempt.id,
          expectedRevision: command.attempt.revision,
          kind: "core.solid-3d-learning.remove",
        },
      ];
    case "core.solid-3d-learning.act":
    case "core.solid-3d-learning.reset":
    case "core.solid-3d-learning.complete": {
      const attempt = before.solidLearningAttempts[command.attemptId];
      return attempt === undefined
        ? []
        : [
            {
              ...meta(),
              action: { kind: "restore", snapshot: attempt },
              attemptId: command.attemptId,
              expectedRevision: attempt.revision + 1,
              kind: "core.solid-3d-learning.act",
            },
          ];
    }
    case "core.solid-3d-learning.remove":
      return [];
  }
}
