import type { BoardDocument } from "../document";
import type { BoardGroup } from "../groups";
import {
  isValidIdentifier,
  type BoardObjectId,
  type GroupId,
} from "../identifiers";
import type { BoardObject } from "../objects";
import type { Vec2 } from "../primitives";
import { ownValue } from "../records";
import { isIsoTimestamp } from "../timestamps";
import { validateBoardDocument } from "../validation/validate";
import type {
  AddGroupCommand,
  AddObjectsCommand,
  BoardCommand,
  DeleteObjectsCommand,
  MoveGroupCommand,
  MoveObjectsCommand,
  RenameDocumentCommand,
  SetViewportCommand,
} from "./commands";

export type CommandErrorCode =
  | "command.duplicate-id"
  | "command.empty"
  | "command.group-exists"
  | "command.group-missing"
  | "command.imported-object-delete-unsupported"
  | "command.imported-object-move-unsupported"
  | "command.imported-group-move-unsupported"
  | "command.invalid"
  | "command.invalid-current-document"
  | "command.invalid-result"
  | "command.locked"
  | "command.object-exists"
  | "command.object-missing"
  | "command.stale-timestamp";

export interface CommandError {
  readonly code: CommandErrorCode;
  readonly message: string;
}

export type CommandResult =
  | {
      readonly document: BoardDocument;
      readonly ok: true;
    }
  | {
      readonly document: BoardDocument;
      readonly error: CommandError;
      readonly ok: false;
    };

function failure(
  document: BoardDocument,
  code: CommandErrorCode,
  message: string,
): CommandResult {
  return { ok: false, document, error: { code, message } };
}

function isFiniteVec2(value: Vec2): boolean {
  return Number.isFinite(value.x) && Number.isFinite(value.y);
}

function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

function validateMetadata(
  document: BoardDocument,
  command: BoardCommand,
): CommandResult | null {
  if (
    !isValidIdentifier(command.id) ||
    !isValidIdentifier(command.actorId) ||
    !isIsoTimestamp(command.timestamp)
  ) {
    return failure(document, "command.invalid", "Command metadata is invalid.");
  }

  if (Date.parse(command.timestamp) < Date.parse(document.updatedAt)) {
    return failure(
      document,
      "command.stale-timestamp",
      "Command timestamp precedes the current document revision.",
    );
  }

  return null;
}

function addObjects(
  document: BoardDocument,
  command: AddObjectsCommand,
): CommandResult {
  if (command.objects.length === 0) {
    return failure(
      document,
      "command.empty",
      "Add objects command requires at least one object.",
    );
  }

  const ids = command.objects.map((object) => object.id);
  if (hasDuplicates(ids)) {
    return failure(
      document,
      "command.duplicate-id",
      "Add objects command contains duplicate IDs.",
    );
  }

  if (ids.some((id) => ownValue(document.objects, id) !== undefined)) {
    return failure(
      document,
      "command.object-exists",
      "Add objects command references an existing object ID.",
    );
  }

  const targetGroups = new Set(
    command.objects.flatMap((object) =>
      object.groupId === null ? [] : [object.groupId],
    ),
  );
  for (const groupId of targetGroups) {
    const group = ownValue(document.groups, groupId);
    if (group === undefined) {
      return failure(
        document,
        "command.group-missing",
        "Add objects command references a missing group.",
      );
    }
    if (group.locked) {
      return failure(
        document,
        "command.locked",
        "Objects cannot be added to a locked group.",
      );
    }
  }

  const atIndex = command.atIndex ?? document.order.length;
  if (
    !Number.isInteger(atIndex) ||
    atIndex < 0 ||
    atIndex > document.order.length
  ) {
    return failure(
      document,
      "command.invalid",
      "Object insertion index is outside the document order.",
    );
  }

  const objects = { ...document.objects };
  const groups = { ...document.groups };
  for (const object of command.objects) {
    objects[object.id] = object;
    if (object.groupId !== null) {
      const group = ownValue(groups, object.groupId);
      if (group !== undefined) {
        groups[object.groupId] = {
          ...group,
          objectIds: [...group.objectIds, object.id],
        };
      }
    }
  }

  const order = [
    ...document.order.slice(0, atIndex),
    ...ids,
    ...document.order.slice(atIndex),
  ];

  return accept(document, {
    ...document,
    updatedAt: command.timestamp,
    objects,
    groups,
    order,
  });
}

function addGroup(
  document: BoardDocument,
  command: AddGroupCommand,
): CommandResult {
  if (ownValue(document.groups, command.group.id) !== undefined) {
    return failure(
      document,
      "command.group-exists",
      "Add group command references an existing group ID.",
    );
  }

  return accept(document, {
    ...document,
    updatedAt: command.timestamp,
    groups: {
      ...document.groups,
      [command.group.id]: command.group,
    },
    objects: attachObjectsToGroup(document, command.group),
  });
}

function attachObjectsToGroup(
  document: BoardDocument,
  group: BoardGroup,
): BoardDocument["objects"] {
  const objects = { ...document.objects };

  for (const objectId of group.objectIds) {
    const object = ownValue(objects, objectId);
    if (object !== undefined) {
      objects[objectId] = { ...object, groupId: group.id };
    }
  }

  return objects;
}

function moveObjects(
  document: BoardDocument,
  command: MoveObjectsCommand,
): CommandResult {
  const selected = selectObjects(document, command.objectIds);
  if (!selected.ok) {
    return selected.result;
  }

  if (selected.objects.some((object) => object.source.kind === "geometryos")) {
    return failure(
      document,
      "command.imported-object-move-unsupported",
      "Moving imported geometry requires an explicit visual override command.",
    );
  }

  if (!isFiniteVec2(command.delta)) {
    return failure(document, "command.invalid", "Movement delta is invalid.");
  }

  const objects = { ...document.objects };
  for (const object of selected.objects) {
    objects[object.id] = {
      ...object,
      position: {
        x: object.position.x + command.delta.x,
        y: object.position.y + command.delta.y,
      },
    };
  }

  return accept(document, {
    ...document,
    updatedAt: command.timestamp,
    objects,
  });
}

function moveGroup(
  document: BoardDocument,
  command: MoveGroupCommand,
): CommandResult {
  const group = ownValue(document.groups, command.groupId);
  if (group === undefined) {
    return failure(
      document,
      "command.group-missing",
      "Move group command references a missing group.",
    );
  }

  if (
    Object.values(document.geometryImports).some(
      (record) => record?.rootGroupId === group.id,
    )
  ) {
    return failure(
      document,
      "command.imported-group-move-unsupported",
      "Moving an imported root group requires an explicit import transform command.",
    );
  }

  const members = group.objectIds
    .map((id) => ownValue(document.objects, id))
    .filter((object): object is BoardObject => object !== undefined);

  if (group.locked || members.some((object) => object.locked)) {
    return failure(
      document,
      "command.locked",
      "Locked groups or members cannot be moved.",
    );
  }

  if (!isFiniteVec2(command.delta)) {
    return failure(document, "command.invalid", "Movement delta is invalid.");
  }

  const movedGroup: BoardGroup = {
    ...group,
    transform: {
      ...group.transform,
      translation: {
        x: group.transform.translation.x + command.delta.x,
        y: group.transform.translation.y + command.delta.y,
      },
    },
  };

  return accept(document, {
    ...document,
    updatedAt: command.timestamp,
    groups: {
      ...document.groups,
      [group.id]: movedGroup,
    },
  });
}

function deleteObjects(
  document: BoardDocument,
  command: DeleteObjectsCommand,
): CommandResult {
  const selected = selectObjects(document, command.objectIds);
  if (!selected.ok) {
    return selected.result;
  }

  if (selected.objects.some((object) => object.source.kind === "geometryos")) {
    return failure(
      document,
      "command.imported-object-delete-unsupported",
      "Deleting imported geometry requires an explicit semantic policy.",
    );
  }

  const deleted = new Set(command.objectIds);
  const objects = Object.fromEntries(
    Object.entries(document.objects).filter(
      ([id]) => !deleted.has(id as BoardObjectId),
    ),
  ) as BoardDocument["objects"];
  const groups = { ...document.groups };
  for (const [id, group] of Object.entries(document.groups)) {
    if (group !== undefined) {
      const objectIds = group.objectIds.filter(
        (objectId) => !deleted.has(objectId),
      );
      if (objectIds.length === 0) {
        delete groups[id as GroupId];
      } else {
        groups[id as GroupId] = { ...group, objectIds };
      }
    }
  }

  return accept(document, {
    ...document,
    updatedAt: command.timestamp,
    objects,
    groups,
    order: document.order.filter((id) => !deleted.has(id)),
  });
}

function setViewport(
  document: BoardDocument,
  command: SetViewportCommand,
): CommandResult {
  if (
    !isFiniteVec2(command.viewport.offset) ||
    !Number.isFinite(command.viewport.zoom) ||
    command.viewport.zoom <= 0
  ) {
    return failure(document, "command.invalid", "Viewport is invalid.");
  }

  return accept(document, {
    ...document,
    updatedAt: command.timestamp,
    viewport: command.viewport,
  });
}

function renameDocument(
  document: BoardDocument,
  command: RenameDocumentCommand,
): CommandResult {
  return accept(document, {
    ...document,
    updatedAt: command.timestamp,
    title: command.title,
  });
}

function selectObjects(
  document: BoardDocument,
  objectIds: readonly BoardObjectId[],
):
  | { readonly objects: readonly BoardObject[]; readonly ok: true }
  | { readonly ok: false; readonly result: CommandResult } {
  if (objectIds.length === 0) {
    return {
      ok: false,
      result: failure(
        document,
        "command.empty",
        "Command requires at least one object.",
      ),
    };
  }

  if (hasDuplicates(objectIds)) {
    return {
      ok: false,
      result: failure(
        document,
        "command.duplicate-id",
        "Command contains duplicate object IDs.",
      ),
    };
  }

  const objects = objectIds.map((id) => ownValue(document.objects, id));
  if (objects.some((object) => object === undefined)) {
    return {
      ok: false,
      result: failure(
        document,
        "command.object-missing",
        "Command references a missing object.",
      ),
    };
  }

  const selected = objects.filter(
    (object): object is BoardObject => object !== undefined,
  );
  if (selected.some((object) => object.locked)) {
    return {
      ok: false,
      result: failure(
        document,
        "command.locked",
        "Locked objects cannot be changed.",
      ),
    };
  }

  if (
    selected.some(
      (object) =>
        object.groupId !== null &&
        ownValue(document.groups, object.groupId)?.locked === true,
    )
  ) {
    return {
      ok: false,
      result: failure(
        document,
        "command.locked",
        "Members of locked groups cannot be changed.",
      ),
    };
  }

  return { ok: true, objects: selected };
}

function accept(
  original: BoardDocument,
  candidate: BoardDocument,
): CommandResult {
  const validation = validateBoardDocument(candidate);

  if (!validation.valid) {
    return failure(
      original,
      "command.invalid-result",
      "Command result violates BoardDocument invariants.",
    );
  }

  return { ok: true, document: candidate };
}

function assertNever(command: never): never {
  throw new Error(`Unsupported command: ${JSON.stringify(command)}`);
}

export function reduceBoardDocument(
  document: BoardDocument,
  command: BoardCommand,
): CommandResult {
  const current = validateBoardDocument(document);
  if (!current.valid) {
    return failure(
      document,
      "command.invalid-current-document",
      "The current BoardDocument is invalid.",
    );
  }

  const metadataError = validateMetadata(document, command);
  if (metadataError !== null) {
    return metadataError;
  }

  switch (command.kind) {
    case "core.objects.add":
      return addObjects(document, command);
    case "core.groups.add":
      return addGroup(document, command);
    case "core.objects.move":
      return moveObjects(document, command);
    case "core.groups.move":
      return moveGroup(document, command);
    case "core.objects.delete":
      return deleteObjects(document, command);
    case "core.viewport.set":
      return setViewport(document, command);
    case "core.document.rename":
      return renameDocument(document, command);
    default:
      return assertNever(command);
  }
}
