import type { BoardDocument } from "../document";
import type { GeometryImportRecord, VisualOverride } from "../geometry-imports";
import type { BoardGroup } from "../groups";
import {
  isValidIdentifier,
  type BoardObjectId,
  type GeometryImportId,
  type GroupId,
} from "../identifiers";
import type { BoardObject } from "../objects";
import { identityTransform, type Vec2 } from "../primitives";
import { ownValue } from "../records";
import { isIsoTimestamp } from "../timestamps";
import { validateBoardDocument } from "../validation/validate";
import type {
  AddGroupCommand,
  AddObjectsCommand,
  BoardCommand,
  DeleteObjectsCommand,
  ImportGeometryCommand,
  OffsetGeometryLabelCommand,
  MoveGroupCommand,
  MoveObjectsCommand,
  MoveSelectionCommand,
  RenameDocumentCommand,
  SetGeometryVisualStyleCommand,
  SetSelectionLockCommand,
  SetViewportCommand,
  TranslateGeometryImportCommand,
} from "./commands";

export type CommandErrorCode =
  | "command.duplicate-id"
  | "command.empty"
  | "command.group-exists"
  | "command.group-missing"
  | "command.import-exists"
  | "command.import-missing"
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

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    new Set(left).size === left.length &&
    new Set(right).size === right.length &&
    left.every((id) => right.includes(id))
  );
}

function importGeometry(
  document: BoardDocument,
  command: ImportGeometryCommand,
): CommandResult {
  if (command.objects.length === 0) {
    return failure(
      document,
      "command.empty",
      "Geometry import requires at least one board object.",
    );
  }
  if (
    ownValue(document.geometryImports, command.importRecord.id) !== undefined
  ) {
    return failure(
      document,
      "command.import-exists",
      "Geometry import ID already exists.",
    );
  }
  if (ownValue(document.groups, command.group.id) !== undefined) {
    return failure(
      document,
      "command.group-exists",
      "Geometry import root group already exists.",
    );
  }

  const objectIds = command.objects.map((object) => object.id);
  if (hasDuplicates(objectIds)) {
    return failure(
      document,
      "command.duplicate-id",
      "Geometry import contains duplicate board object IDs.",
    );
  }
  if (objectIds.some((id) => ownValue(document.objects, id) !== undefined)) {
    return failure(
      document,
      "command.object-exists",
      "Geometry import collides with an existing board object.",
    );
  }
  if (
    command.importRecord.rootGroupId !== command.group.id ||
    !sameIds(command.group.objectIds, objectIds) ||
    !sameIds(command.importRecord.boardObjectIds, objectIds) ||
    command.objects.some(
      (object) =>
        object.groupId !== command.group.id ||
        object.source.kind !== "geometryos" ||
        object.source.importId !== command.importRecord.id,
    )
  ) {
    return failure(
      document,
      "command.invalid",
      "Geometry import record, group and objects are inconsistent.",
    );
  }

  const objects = { ...document.objects };
  for (const object of command.objects) {
    objects[object.id] = object;
  }

  return accept(document, {
    ...document,
    updatedAt: command.timestamp,
    objects,
    order: [...document.order, ...objectIds],
    groups: {
      ...document.groups,
      [command.group.id]: command.group,
    },
    geometryImports: {
      ...document.geometryImports,
      [command.importRecord.id]: command.importRecord,
    },
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

function geometryImportForGroup(
  document: BoardDocument,
  groupId: GroupId,
): GeometryImportRecord | undefined {
  return Object.values(document.geometryImports).find(
    (record): record is GeometryImportRecord => record?.rootGroupId === groupId,
  );
}

function translatedVisualOverride(
  current: VisualOverride | undefined,
  delta: Vec2,
): VisualOverride {
  const base = current ?? identityTransform;
  return {
    ...base,
    translation: {
      x: base.translation.x + delta.x,
      y: base.translation.y + delta.y,
    },
  };
}

function translateImportRecord(
  record: GeometryImportRecord,
  delta: Vec2,
): GeometryImportRecord {
  return {
    ...record,
    visualTransform: {
      ...record.visualTransform,
      translation: {
        x: record.visualTransform.translation.x + delta.x,
        y: record.visualTransform.translation.y + delta.y,
      },
    },
  };
}

function validateImportUnlocked(
  document: BoardDocument,
  record: GeometryImportRecord,
): CommandResult | null {
  const group = ownValue(document.groups, record.rootGroupId);
  const members = record.boardObjectIds
    .map((id) => ownValue(document.objects, id))
    .filter((object): object is BoardObject => object !== undefined);
  return group?.locked === true || members.some((object) => object.locked)
    ? failure(
        document,
        "command.locked",
        "Locked geometry imports cannot be changed.",
      )
    : null;
}

function translateGeometryImport(
  document: BoardDocument,
  command: TranslateGeometryImportCommand,
): CommandResult {
  const record = ownValue(document.geometryImports, command.importId);
  if (record === undefined) {
    return failure(
      document,
      "command.import-missing",
      "Geometry translation references a missing import.",
    );
  }
  if (!isFiniteVec2(command.delta)) {
    return failure(document, "command.invalid", "Movement delta is invalid.");
  }
  const locked = validateImportUnlocked(document, record);
  if (locked !== null) {
    return locked;
  }
  return accept(document, {
    ...document,
    updatedAt: command.timestamp,
    geometryImports: {
      ...document.geometryImports,
      [record.id]: translateImportRecord(record, command.delta),
    },
  });
}

function selectImportedObject(
  document: BoardDocument,
  importId: GeometryImportId,
  objectId: BoardObjectId,
):
  | { readonly object: BoardObject; readonly record: GeometryImportRecord }
  | CommandResult {
  const record = ownValue(document.geometryImports, importId);
  if (record === undefined) {
    return failure(
      document,
      "command.import-missing",
      "Visual override references a missing geometry import.",
    );
  }
  const object = ownValue(document.objects, objectId);
  if (object === undefined) {
    return failure(
      document,
      "command.object-missing",
      "Visual override references a missing object.",
    );
  }
  if (
    object.source.kind !== "geometryos" ||
    object.source.importId !== importId ||
    !record.boardObjectIds.includes(object.id)
  ) {
    return failure(
      document,
      "command.invalid",
      "Visual override must target an object from the same geometry import.",
    );
  }
  const locked = validateImportUnlocked(document, record);
  return locked ?? { object, record };
}

function offsetGeometryLabel(
  document: BoardDocument,
  command: OffsetGeometryLabelCommand,
): CommandResult {
  if (!isFiniteVec2(command.delta)) {
    return failure(document, "command.invalid", "Label offset is invalid.");
  }
  const selected = selectImportedObject(
    document,
    command.importId,
    command.objectId,
  );
  if ("ok" in selected) {
    return selected;
  }
  if (selected.object.kind !== "drawing.text") {
    return failure(
      document,
      "command.invalid",
      "Label offsets can only target imported text objects.",
    );
  }
  return accept(document, {
    ...document,
    updatedAt: command.timestamp,
    geometryImports: {
      ...document.geometryImports,
      [selected.record.id]: {
        ...selected.record,
        visualOverrides: {
          ...selected.record.visualOverrides,
          [selected.object.id]: translatedVisualOverride(
            ownValue(selected.record.visualOverrides, selected.object.id),
            command.delta,
          ),
        },
      },
    },
  });
}

function setGeometryVisualStyle(
  document: BoardDocument,
  command: SetGeometryVisualStyleCommand,
): CommandResult {
  if (Object.keys(command.style).length === 0) {
    return failure(
      document,
      "command.empty",
      "Visual style override requires at least one property.",
    );
  }
  const selected = selectImportedObject(
    document,
    command.importId,
    command.objectId,
  );
  if ("ok" in selected) {
    return selected;
  }
  const current = ownValue(selected.record.visualOverrides, selected.object.id);
  const override: VisualOverride = {
    ...(current ?? identityTransform),
    style: { ...current?.style, ...command.style },
  };
  return accept(document, {
    ...document,
    updatedAt: command.timestamp,
    geometryImports: {
      ...document.geometryImports,
      [selected.record.id]: {
        ...selected.record,
        visualOverrides: {
          ...selected.record.visualOverrides,
          [selected.object.id]: override,
        },
      },
    },
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

  const geometryImport = geometryImportForGroup(document, group.id);
  if (geometryImport !== undefined) {
    return accept(document, {
      ...document,
      updatedAt: command.timestamp,
      geometryImports: {
        ...document.geometryImports,
        [geometryImport.id]: translateImportRecord(
          geometryImport,
          command.delta,
        ),
      },
    });
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

interface SelectionTargets {
  readonly groups: readonly BoardGroup[];
  readonly objects: readonly BoardObject[];
}

function selectTargets(
  document: BoardDocument,
  objectIds: readonly BoardObjectId[],
  groupIds: readonly GroupId[],
): SelectionTargets | CommandResult {
  if (objectIds.length + groupIds.length === 0) {
    return failure(
      document,
      "command.empty",
      "Selection command requires at least one target.",
    );
  }
  if (hasDuplicates(objectIds) || hasDuplicates(groupIds)) {
    return failure(
      document,
      "command.duplicate-id",
      "Selection command contains duplicate target IDs.",
    );
  }

  const objects = objectIds.map((id) => ownValue(document.objects, id));
  if (objects.some((object) => object === undefined)) {
    return failure(
      document,
      "command.object-missing",
      "Selection command references a missing object.",
    );
  }
  const groups = groupIds.map((id) => ownValue(document.groups, id));
  if (groups.some((group) => group === undefined)) {
    return failure(
      document,
      "command.group-missing",
      "Selection command references a missing group.",
    );
  }

  const selectedObjects = objects.filter(
    (object): object is BoardObject => object !== undefined,
  );
  const selectedGroups = groups.filter(
    (group): group is BoardGroup => group !== undefined,
  );
  const selectedGroupIds = new Set(groupIds);
  if (
    selectedObjects.some(
      (object) =>
        object.groupId !== null && selectedGroupIds.has(object.groupId),
    )
  ) {
    return failure(
      document,
      "command.duplicate-id",
      "An object cannot be targeted separately from its selected group.",
    );
  }
  if (selectedObjects.some((object) => object.groupId !== null)) {
    return failure(
      document,
      "command.invalid",
      "Grouped objects must be targeted through their group ID.",
    );
  }

  return { groups: selectedGroups, objects: selectedObjects };
}

function moveSelection(
  document: BoardDocument,
  command: MoveSelectionCommand,
): CommandResult {
  if (!isFiniteVec2(command.delta)) {
    return failure(document, "command.invalid", "Movement delta is invalid.");
  }

  const targets = selectTargets(document, command.objectIds, command.groupIds);
  if ("ok" in targets) {
    return targets;
  }

  const groupMembers = targets.groups.flatMap((group) =>
    group.objectIds
      .map((id) => ownValue(document.objects, id))
      .filter((object): object is BoardObject => object !== undefined),
  );
  if (targets.objects.some((object) => object.source.kind === "geometryos")) {
    return failure(
      document,
      "command.imported-object-move-unsupported",
      "Moving imported geometry requires an explicit visual transform command.",
    );
  }
  if (
    targets.objects.some((object) => object.locked) ||
    targets.groups.some((group) => group.locked) ||
    groupMembers.some((object) => object.locked) ||
    targets.objects.some(
      (object) =>
        object.groupId !== null &&
        ownValue(document.groups, object.groupId)?.locked === true,
    )
  ) {
    return failure(
      document,
      "command.locked",
      "Locked selection targets cannot be moved.",
    );
  }

  const objects = { ...document.objects };
  for (const object of targets.objects) {
    objects[object.id] = {
      ...object,
      position: {
        x: object.position.x + command.delta.x,
        y: object.position.y + command.delta.y,
      },
    };
  }

  const groups = { ...document.groups };
  const geometryImports = { ...document.geometryImports };
  for (const group of targets.groups) {
    const geometryImport = geometryImportForGroup(document, group.id);
    if (geometryImport === undefined) {
      groups[group.id] = {
        ...group,
        transform: {
          ...group.transform,
          translation: {
            x: group.transform.translation.x + command.delta.x,
            y: group.transform.translation.y + command.delta.y,
          },
        },
      };
    } else {
      geometryImports[geometryImport.id] = translateImportRecord(
        geometryImport,
        command.delta,
      );
    }
  }

  return accept(document, {
    ...document,
    updatedAt: command.timestamp,
    geometryImports,
    groups,
    objects,
  });
}

function setSelectionLock(
  document: BoardDocument,
  command: SetSelectionLockCommand,
): CommandResult {
  const targets = selectTargets(document, command.objectIds, command.groupIds);
  if ("ok" in targets) {
    return targets;
  }

  const objects = { ...document.objects };
  for (const object of targets.objects) {
    objects[object.id] = { ...object, locked: command.locked };
  }
  const groups = { ...document.groups };
  for (const group of targets.groups) {
    groups[group.id] = { ...group, locked: command.locked };
    for (const objectId of group.objectIds) {
      const member = ownValue(objects, objectId);
      if (member !== undefined) {
        objects[objectId] = { ...member, locked: command.locked };
      }
    }
  }

  return accept(document, {
    ...document,
    updatedAt: command.timestamp,
    groups,
    objects,
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
    case "core.geometry.import":
      return importGeometry(document, command);
    case "core.geometry.translate":
      return translateGeometryImport(document, command);
    case "core.geometry.label-offset":
      return offsetGeometryLabel(document, command);
    case "core.geometry.style-override":
      return setGeometryVisualStyle(document, command);
    case "core.objects.move":
      return moveObjects(document, command);
    case "core.groups.move":
      return moveGroup(document, command);
    case "core.objects.delete":
      return deleteObjects(document, command);
    case "core.selection.move":
      return moveSelection(document, command);
    case "core.selection.set-lock":
      return setSelectionLock(document, command);
    case "core.viewport.set":
      return setViewport(document, command);
    case "core.document.rename":
      return renameDocument(document, command);
    default:
      return assertNever(command);
  }
}
