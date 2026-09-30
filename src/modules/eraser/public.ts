import type {
  CommandMetadata,
  RewriteObjectsCommand,
} from "../../core/public";

export {
  eraseBoardSceneObjects,
  eraseDocumentPenStrokes,
  erasePenStroke,
  type EraserFragmentIdFactory,
  type EraserObjectChange,
  type EraserResult,
} from "./geometry";

export const eraserToolId = "editing.eraser" as const;

export function createEraserRewriteCommand(
  metadata: CommandMetadata,
  changes: RewriteObjectsCommand["changes"],
): RewriteObjectsCommand {
  return {
    ...metadata,
    changes,
    kind: "core.objects.rewrite",
  };
}
