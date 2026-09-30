import type {
  CommandMetadata,
  BatchReplaceObjectsCommand,
  BoardDocument,
  BoardObject,
  BoardObjectId,
  DeleteObjectsCommand,
  ReplaceObjectsCommand,
} from "../../core/public";

export {
  defaultEraserDiameterPx,
  eraseDocumentObjects,
  eraseDocumentPenStrokes,
  erasePenStroke,
  maximumEraserDiameterPx,
  minimumEraserDiameterPx,
  type EraserDocumentResult,
  type EraserFragmentIdFactory,
  type EraserResult,
  type EraserStrokeChange,
} from "./geometry";

export const eraserToolId = "editing.eraser" as const;

export type EraserCommand = DeleteObjectsCommand | ReplaceObjectsCommand;

export function createEraserCommand(
  metadata: CommandMetadata,
  originals: readonly BoardObject[],
  replacements: readonly BoardObject[],
): EraserCommand {
  if (replacements.length === 0) {
    return {
      ...metadata,
      kind: "core.objects.delete",
      objectIds: originals.map(({ id }) => id),
    };
  }
  return {
    ...metadata,
    kind: "core.objects.replace",
    originals,
    replacements,
  };
}

export function createBatchEraserCommand(
  metadata: CommandMetadata,
  document: BoardDocument,
  changes: readonly {
    readonly original: BoardObject;
    readonly replacements: readonly BoardObject[];
  }[],
): BatchReplaceObjectsCommand | null {
  if (changes.length === 0) return null;
  return {
    ...metadata,
    changes: changes.map(({ original, replacements }) => ({
      atIndex: document.order.indexOf(original.id),
      originals: [original],
      replacements,
    })),
    kind: "core.objects.batch-replace",
  };
}

export function createDeleteEraserCommand(
  metadata: CommandMetadata,
  objectIds: readonly BoardObjectId[],
): DeleteObjectsCommand | null {
  return objectIds.length === 0
    ? null
    : {
        ...metadata,
        kind: "core.objects.delete",
        objectIds,
      };
}

export {
  eraserPreferencesStorageKey,
  normalizeEraserDiameterPx,
  readEraserDiameterPx,
  writeEraserDiameterPx,
} from "./preferences";
