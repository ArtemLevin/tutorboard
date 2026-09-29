import type {
  CommandMetadata,
  DeleteObjectsCommand,
  PenStrokeObject,
  ReplaceObjectsCommand,
} from "../../core/public";

export {
  eraseDocumentPenStrokes,
  erasePenStroke,
  eraserRadiusPx,
  type EraserFragmentIdFactory,
  type EraserResult,
  type EraserStrokeChange,
} from "./geometry";

export const eraserToolId = "editing.eraser" as const;

export type EraserCommand = DeleteObjectsCommand | ReplaceObjectsCommand;

export function createEraserCommand(
  metadata: CommandMetadata,
  originals: readonly PenStrokeObject[],
  replacements: readonly PenStrokeObject[],
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
