import {
  type BoardObjectId,
  type CommandMetadata,
  type SetSelectionStyleCommand,
  type VisualStyleOverride,
} from "../../core/public";

export function createSetSelectionStyleCommand(
  metadata: CommandMetadata,
  objectIds: readonly BoardObjectId[],
  style: VisualStyleOverride,
): SetSelectionStyleCommand {
  return {
    ...metadata,
    kind: "core.selection.set-style",
    objectIds,
    style,
  };
}
