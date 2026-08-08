import type {
  BoardDocument,
  BoardObjectId,
  Solid3DRecord,
} from "../../core/public";

export function findSolidModelByObjectId(
  document: BoardDocument,
  objectId: BoardObjectId,
): Solid3DRecord | null {
  return (
    Object.values(document.solidModels).find(
      (record): record is Solid3DRecord =>
        record?.boardObjectIds.includes(objectId) === true,
    ) ?? null
  );
}

export function findSolidModelBySelection(
  document: BoardDocument,
  objectIds: readonly BoardObjectId[],
): Solid3DRecord | null {
  const records = new Set(
    objectIds.flatMap((id) => {
      const record = findSolidModelByObjectId(document, id);
      return record === null ? [] : [record];
    }),
  );
  return records.size === 1 ? [...records][0]! : null;
}
