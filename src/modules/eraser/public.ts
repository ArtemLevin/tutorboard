import type {
  CommandMetadata,
  DeleteObjectsCommand,
  BoardObject,
  ReplaceObjectsCommand,
} from "../../core/public";

export {
  eraseDocumentPenStrokes,
  erasePenStroke,
  eraserRadiusPx,
  planEraserChanges,
  type EraserFragmentIdFactory,
  type EraserPlan,
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
