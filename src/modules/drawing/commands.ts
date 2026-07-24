import type { AddObjectsCommand, CommandMetadata } from "../../core/public";

import type { UserDrawingObject } from "./interaction";

export function createAddDrawingObjectCommand(
  metadata: CommandMetadata,
  object: UserDrawingObject,
): AddObjectsCommand {
  return {
    ...metadata,
    kind: "core.objects.add",
    objects: [object],
  };
}
