import {
  type BoardDocument,
  type BoardGroup,
  type BoardObject,
  type BoardObjectId,
  type CommandMetadata,
  type CoordinatePlotDefinition,
  type CutContentCommand,
  type DocumentId,
  type GeometryImportId,
  type GeometryImportRecord,
  type GroupId,
  solid3DId,
  solidPointId,
  solidSectionId,
  type Solid3DId,
  type Solid3DRecord,
  type PasteContentCommand,
  type Vec2,
} from "../../core/public";

export const boardClipboardSchemaVersion = "1.3" as const;
export const defaultPasteOffset: Vec2 = { x: 24, y: 24 };

export interface BoardClipboardPayload {
  readonly geometryImports: readonly GeometryImportRecord[];
  readonly groups: readonly BoardGroup[];
  readonly objects: readonly BoardObject[];
  readonly order: readonly BoardObjectId[];
  readonly schemaVersion: typeof boardClipboardSchemaVersion;
  readonly sourceDocumentId: DocumentId;
  readonly solidModels?: readonly Solid3DRecord[];
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

function copyClipboardObject(object: BoardObject): BoardObject {
  if (object.kind === "drawing.pen-stroke") {
    return {
      ...object,
      points: object.points.map((point) => ({ ...point })),
      ...(object.ink === undefined
        ? {}
        : {
            ink: {
              ...object.ink,
              centerline: object.ink.centerline.map((segment) => ({
                control1: { ...segment.control1 },
                control2: { ...segment.control2 },
                end: { ...segment.end },
                start: { ...segment.start },
              })),
              samples: object.ink.samples.map((sample) => ({
                ...sample,
                point: { ...sample.point },
              })),
            },
          }),
    };
  }
  if (object.kind === "math.coordinate-plot") {
    return {
      ...object,
      definition: copyCoordinatePlotDefinition(object.definition),
    };
  }
  return object;
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
    return object === undefined ? [] : [copyClipboardObject(object)];
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
  const solidModels = Object.values(document.solidModels).filter(
    (record): record is Solid3DRecord =>
      record !== undefined &&
      record.boardObjectIds.some((id) => objectIds.has(id)),
  );

  return {
    payload: {
      geometryImports,
      groups,
      objects,
      order,
      schemaVersion: boardClipboardSchemaVersion,
      sourceDocumentId: document.id,
      solidModels,
    },
    status: "ok",
  };
}

export interface ClipboardIdFactory {
  readonly geometryImport: (sourceId: GeometryImportId) => GeometryImportId;
  readonly group: (sourceId: GroupId) => GroupId;
  readonly object: (sourceId: BoardObjectId) => BoardObjectId;
  readonly solid3D?: (sourceId: Solid3DId) => Solid3DId;
}

function translated(position: Vec2, offset: Vec2): Vec2 {
  return { x: position.x + offset.x, y: position.y + offset.y };
}

function copyCoordinatePlotDefinition(
  definition: CoordinatePlotDefinition,
): CoordinatePlotDefinition {
  return {
    axes: { ...definition.axes },
    coordinateViewport: { ...definition.coordinateViewport },
    expressionLanguage: definition.expressionLanguage,
    grid: { ...definition.grid },
    legend: { ...definition.legend },
    parameters: definition.parameters.map((parameter) => ({ ...parameter })),
    series: definition.series.map((series) => {
      if (series.kind === "explicit") {
        return {
          ...series,
          domain: { ...series.domain },
          style: { ...series.style },
        };
      }
      if (series.kind === "parametric") {
        return {
          ...series,
          range: { ...series.range },
          style: { ...series.style },
        };
      }
      return { ...series, style: { ...series.style } };
    }),
    size: { ...definition.size },
  };
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
  const solidIds = new Map(
    (payload.solidModels ?? []).map(
      ({ id }, index) =>
        [
          id,
          ids.solid3D?.(id) ?? solid3DId(`solid:paste:${String(index)}:${id}`),
        ] as const,
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
    const copied =
      object.kind === "math.coordinate-plot"
        ? {
            ...object,
            definition: copyCoordinatePlotDefinition(object.definition),
          }
        : object.kind === "drawing.pen-stroke"
          ? {
              ...object,
              points: object.points.map((point) => ({ ...point })),
              ...(object.ink === undefined
                ? {}
                : {
                    ink: {
                      ...object.ink,
                      centerline: object.ink.centerline.map((segment) => ({
                        control1: { ...segment.control1 },
                        control2: { ...segment.control2 },
                        end: { ...segment.end },
                        start: { ...segment.start },
                      })),
                      samples: object.ink.samples.map((sample) => ({
                        ...sample,
                        point: { ...sample.point },
                      })),
                    },
                  }),
            }
          : object;
    return {
      ...copied,
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
  const solidModels = (payload.solidModels ?? []).map(
    (record): Solid3DRecord => {
      const id = solidIds.get(record.id) ?? record.id;
      const pointIds = new Map(
        record.points.map(
          (point, index) =>
            [point.id, solidPointId(`${id}:point:${String(index)}`)] as const,
        ),
      );
      return {
        ...record,
        boardObjectIds: record.boardObjectIds.map(remapObjectId),
        id,
        points: record.points.map((point) => ({
          ...point,
          id: pointIds.get(point.id) ?? point.id,
        })),
        rootGroupId: groupIds.get(record.rootGroupId) ?? record.rootGroupId,
        sections: record.sections.map((section, index) => ({
          ...section,
          id: solidSectionId(`${id}:section:${String(index)}`),
          pointIds: [
            pointIds.get(section.pointIds[0]) ?? section.pointIds[0],
            pointIds.get(section.pointIds[1]) ?? section.pointIds[1],
            pointIds.get(section.pointIds[2]) ?? section.pointIds[2],
          ],
        })),
      };
    },
  );

  return {
    ...metadata,
    geometryImports,
    groups,
    kind: "core.clipboard.paste",
    objects,
    solidModels,
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
    solidIds: (payload.solidModels ?? []).map(({ id }) => id),
  };
}
