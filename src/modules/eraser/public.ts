import type {
  CommandMetadata,
  PenStrokeObject,
  ReplaceObjectsCommand,
} from "../../core/public";

export {
  eraseDocumentPenStrokes,
  erasePenStroke,
  eraserRadiusPx,
  type EraserFragmentIdFactory,
  type EraserResult,
} from "./geometry";

export const eraserToolId = "editing.eraser" as const;

export function createEraserCommand(
  metadata: CommandMetadata,
  originals: readonly PenStrokeObject[],
  replacements: readonly PenStrokeObject[],
): ReplaceObjectsCommand {
  return {
    ...metadata,
    kind: "core.objects.replace",
    originals,
    replacements,
  };
}
