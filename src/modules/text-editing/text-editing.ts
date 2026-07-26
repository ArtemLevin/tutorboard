import {
  type BoardObject,
  type BoardObjectId,
  type CommandMetadata,
  type TextObject,
  type UpdateTextCommand,
} from "../../core/public";

export function isEditableTextObject(
  object: BoardObject | undefined,
): object is TextObject & { readonly source: { readonly kind: "user" } } {
  return (
    object?.kind === "drawing.text" &&
    object.source.kind === "user" &&
    !object.locked
  );
}

export function createUpdateTextCommand(
  metadata: CommandMetadata,
  objectId: BoardObjectId,
  text: string,
): UpdateTextCommand {
  return { ...metadata, kind: "core.text.update", objectId, text };
}
