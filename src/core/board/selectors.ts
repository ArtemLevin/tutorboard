import type { BoardDocument } from "./document";
import type { GroupId } from "./identifiers";
import type { BoardObject } from "./objects";
import { identityTransform, type Transform2D } from "./primitives";
import { ownValue } from "./records";

export interface BoardRenderItem {
  readonly object: BoardObject;
  readonly transforms: readonly Transform2D[];
}

export interface BoardSceneReadModel {
  readonly items: readonly BoardRenderItem[];
  readonly viewport: BoardDocument["viewport"];
}

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

function selectObjectTransforms(
  document: BoardDocument,
  object: BoardObject,
): readonly Transform2D[] {
  if (object.source.kind === "geometryos") {
    const geometryImport = ownValue(
      document.geometryImports,
      object.source.importId,
    );
    if (geometryImport === undefined) {
      return [identityTransform];
    }

    const visualOverride = ownValue(geometryImport.visualOverrides, object.id);
    return visualOverride === undefined
      ? [geometryImport.visualTransform]
      : [geometryImport.visualTransform, visualOverride];
  }

  if (object.groupId === null) {
    return [];
  }

  const group = ownValue(document.groups, object.groupId);
  return group === undefined ? [] : [group.transform];
}

export function selectBoardScene(document: BoardDocument): BoardSceneReadModel {
  return {
    viewport: document.viewport,
    items: selectOrderedObjects(document).map((object) => {
      if (object.source.kind !== "geometryos") {
        return { object, transforms: selectObjectTransforms(document, object) };
      }
      const geometryImport = ownValue(
        document.geometryImports,
        object.source.importId,
      );
      const visualOverride =
        geometryImport === undefined
          ? undefined
          : ownValue(geometryImport.visualOverrides, object.id);
      return {
        object:
          visualOverride?.style === undefined
            ? object
            : {
                ...object,
                style: { ...object.style, ...visualOverride.style },
              },
        transforms: selectObjectTransforms(document, object),
      };
    }),
  };
}
