import {
  type BoardDocument,
  type BoardGroup,
  type BoardObject,
  type BoardObjectId,
  type CommandMetadata,
  type CutContentCommand,
  type DocumentId,
  type GeometryImportId,
  type GeometryImportRecord,
  type GroupId,
  type PasteContentCommand,
  type Vec2,
} from "../../core/public";

export const boardClipboardSchemaVersion = "1.0" as const;
export const defaultPasteOffset: Vec2 = { x: 24, y: 24 };

export interface BoardClipboardPayload {
  readonly geometryImports: readonly GeometryImportRecord[];
  readonly groups: readonly BoardGroup[];
  readonly objects: readonly BoardObject[];
  readonly order: readonly BoardObjectId[];
  readonly schemaVersion: typeof boardClipboardSchemaVersion;
  readonly sourceDocumentId: DocumentId;
}

export type CopyBoardSelectionResult =
  | { readonly code: "clipboard.empty"; readonly status: "error" }
  | { readonly payload: BoardClipboardPayload; readonly status: "ok" };

function ownValue<Key extends PropertyKey, Value>(
  record: Readonly<Partial<Record<Key, Value>>>,
  key: Key,
): Value | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

export function copyBoardSelection(
  document: BoardDocument,
  selectedObjectIds: readonly BoardObjectId[],
): CopyBoardSelectionResult {
  const objectIds = new Set(
    selectedObjectIds.filter(
      (id) => ownValue(document.objects, id) !== undefined,
    ),
  );
  if (objectIds.size === 0) {
    return { code: "clipboard.empty", status: "error" };
  }

  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const objectId of [...objectIds]) {
      const object = ownValue(document.objects, objectId);
      if (object?.groupId !== null && object?.groupId !== undefined) {
        const group = ownValue(document.groups, object.groupId);
        for (const memberId of group?.objectIds ?? []) {
          if (!objectIds.has(memberId)) {
            objectIds.add(memberId);
            expanded = true;
          }
        }
      }
      if (object?.source.kind === "geometryos") {
        const record = ownValue(
          document.geometryImports,
          object.source.importId,
        );
        for (const memberId of record?.boardObjectIds ?? []) {
          if (!objectIds.has(memberId)) {
            objectIds.add(memberId);
            expanded = true;
          }
        }
      }
    }
  }

  const order = document.order.filter((id) => objectIds.has(id));
  const objects = order.flatMap((id) => {
    const object = ownValue(document.objects, id);
    return object === undefined ? [] : [object];
  });
  const groupIds = new Set(
    objects.flatMap(({ groupId }) => (groupId === null ? [] : [groupId])),
  );
  const importIds = new Set(
    objects.flatMap(({ source }) =>
      source.kind === "geometryos" ? [source.importId] : [],
    ),
  );
  const groups = [...groupIds].sort().flatMap((id) => {
    const group = ownValue(document.groups, id);
    return group === undefined ? [] : [group];
  });
  const geometryImports = [...importIds].sort().flatMap((id) => {
    const record = ownValue(document.geometryImports, id);
    return record === undefined ? [] : [record];
  });

  return {
    payload: {
      geometryImports,
      groups,
      objects,
      order,
      schemaVersion: boardClipboardSchemaVersion,
      sourceDocumentId: document.id,
    },
    status: "ok",
  };
}

export interface ClipboardIdFactory {
  readonly geometryImport: (sourceId: GeometryImportId) => GeometryImportId;
  readonly group: (sourceId: GroupId) => GroupId;
  readonly object: (sourceId: BoardObjectId) => BoardObjectId;
}

function translated(position: Vec2, offset: Vec2): Vec2 {
  return { x: position.x + offset.x, y: position.y + offset.y };
}

export function createPasteContentCommand(
  payload: BoardClipboardPayload,
  metadata: CommandMetadata,
  ids: ClipboardIdFactory,
  offset: Vec2 = defaultPasteOffset,
): PasteContentCommand {
  const objectIds = new Map(
    payload.order.map((id) => [id, ids.object(id)] as const),
  );
  const groupIds = new Map(
    payload.groups.map(({ id }) => [id, ids.group(id)] as const),
  );
  const importIds = new Map(
    payload.geometryImports.map(
      ({ id }) => [id, ids.geometryImport(id)] as const,
    ),
  );
  const importRootGroups = new Set(
    payload.geometryImports.map(({ rootGroupId }) => rootGroupId),
  );
  const remapObjectId = (id: BoardObjectId): BoardObjectId => {
    const mapped = objectIds.get(id);
    if (mapped === undefined) {
      throw new Error(`Clipboard payload has an unmapped object: ${id}`);
    }
    return mapped;
  };

  const objects = payload.objects.map((object): BoardObject => {
    const groupId =
      object.groupId === null ? null : (groupIds.get(object.groupId) ?? null);
    const source =
      object.source.kind === "user"
        ? object.source
        : {
            ...object.source,
            importId:
              importIds.get(object.source.importId) ?? object.source.importId,
          };
    return {
      ...object,
      groupId,
      id: remapObjectId(object.id),
      position:
        object.groupId === null
          ? translated(object.position, offset)
          : object.position,
      source,
    };
  });

  const groups = payload.groups.map((group): BoardGroup => ({
    ...group,
    id: groupIds.get(group.id) ?? group.id,
    objectIds: group.objectIds.map(remapObjectId),
    transform: importRootGroups.has(group.id)
      ? group.transform
      : {
          ...group.transform,
          translation: translated(group.transform.translation, offset),
        },
  }));

  const geometryImports = payload.geometryImports.map(
    (record): GeometryImportRecord => ({
      ...record,
      boardObjectIds: record.boardObjectIds.map(remapObjectId),
      id: importIds.get(record.id) ?? record.id,
      mapping: Object.fromEntries(
        Object.entries(record.mapping).map(([key, values]) => [
          key,
          values.map(remapObjectId),
        ]),
      ),
      rootGroupId: groupIds.get(record.rootGroupId) ?? record.rootGroupId,
      visualOverrides: Object.fromEntries(
        Object.entries(record.visualOverrides).map(([key, value]) => [
          remapObjectId(key as BoardObjectId),
          value,
        ]),
      ),
      visualTransform: {
        ...record.visualTransform,
        translation: translated(record.visualTransform.translation, offset),
      },
    }),
  );

  return {
    ...metadata,
    geometryImports,
    groups,
    kind: "core.clipboard.paste",
    objects,
  };
}

export function createCutContentCommand(
  payload: BoardClipboardPayload,
  metadata: CommandMetadata,
): CutContentCommand {
  return {
    ...metadata,
    geometryImportIds: payload.geometryImports.map(({ id }) => id),
    groupIds: payload.groups.map(({ id }) => id),
    kind: "core.clipboard.cut",
    objectIds: payload.order,
  };
}
