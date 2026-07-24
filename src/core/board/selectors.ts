import type { BoardDocument } from "./document";
import type { GroupId } from "./identifiers";
import type { BoardObject } from "./objects";
import { ownValue } from "./records";

export function selectOrderedObjects(
  document: BoardDocument,
): readonly BoardObject[] {
  return document.order
    .map((id) => ownValue(document.objects, id))
    .filter((object): object is BoardObject => object !== undefined);
}

export function selectGroupObjects(
  document: BoardDocument,
  groupId: GroupId,
): readonly BoardObject[] {
  const group = ownValue(document.groups, groupId);
  if (group === undefined) {
    return [];
  }

  return group.objectIds
    .map((id) => ownValue(document.objects, id))
    .filter((object): object is BoardObject => object !== undefined);
}
