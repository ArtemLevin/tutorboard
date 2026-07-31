import type { BoardDocument } from "./document";
import type { GroupId } from "./identifiers";
import type { BoardObject } from "./objects";
import {
  identityTransform,
  type Size2,
  type Transform2D,
  type Vec2,
  type ViewportState,
} from "./primitives";
import { ownValue } from "./records";

export interface BoardRenderItem {
  readonly object: BoardObject;
  readonly transforms: readonly Transform2D[];
}

export interface BoardSceneReadModel {
  readonly items: readonly BoardRenderItem[];
  readonly viewport: BoardDocument["viewport"];
}

export interface BoardSceneSelector {
  (document: BoardDocument): BoardSceneReadModel;
  readonly cacheSize: () => number;
  readonly reset: () => void;
}

export interface BoardViewportSize extends Size2 {
  readonly overscan?: number;
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

function visualObject(
  document: BoardDocument,
  object: BoardObject,
): BoardObject {
  if (object.source.kind !== "geometryos") {
    return object;
  }
  const geometryImport = ownValue(
    document.geometryImports,
    object.source.importId,
  );
  const visualOverride =
    geometryImport === undefined
      ? undefined
      : ownValue(geometryImport.visualOverrides, object.id);
  return visualOverride?.style === undefined
    ? object
    : { ...object, style: { ...object.style, ...visualOverride.style } };
}

export function createBoardSceneSelector(): BoardSceneSelector {
  let previousDocument: BoardDocument | null = null;
  let previousScene: BoardSceneReadModel | null = null;
  let cache = new Map<
    BoardObject["id"],
    {
      readonly group: unknown;
      readonly importRecord: unknown;
      readonly item: BoardRenderItem;
      readonly object: BoardObject;
      readonly override: unknown;
    }
  >();

  const selector = ((document: BoardDocument): BoardSceneReadModel => {
    if (previousDocument === document && previousScene !== null) {
      return previousScene;
    }
    const nextCache = new Map<
      (typeof document.order)[number],
      {
        readonly group: unknown;
        readonly importRecord: unknown;
        readonly item: BoardRenderItem;
        readonly object: BoardObject;
        readonly override: unknown;
      }
    >();
    const items = document.order.flatMap((id) => {
      const object = ownValue(document.objects, id);
      if (object === undefined) {
        return [];
      }
      const group =
        object.groupId === null
          ? undefined
          : ownValue(document.groups, object.groupId);
      const importRecord =
        object.source.kind === "geometryos"
          ? ownValue(document.geometryImports, object.source.importId)
          : undefined;
      const override =
        importRecord === undefined
          ? undefined
          : ownValue(importRecord.visualOverrides, object.id);
      const previous = cache.get(id);
      const item =
        previous !== undefined &&
        previous.object === object &&
        previous.group === group &&
        previous.importRecord === importRecord &&
        previous.override === override
          ? previous.item
          : {
              object: visualObject(document, object),
              transforms: selectObjectTransforms(document, object),
            };
      nextCache.set(id, { group, importRecord, item, object, override });
      return [item];
    });
    cache = nextCache;
    previousDocument = document;
    previousScene = { items, viewport: document.viewport };
    return previousScene;
  }) as BoardSceneSelector;
  Object.defineProperties(selector, {
    cacheSize: { value: () => cache.size },
    reset: {
      value: () => {
        cache.clear();
        previousDocument = null;
        previousScene = null;
      },
    },
  });
  return selector;
}

function rotate(point: Vec2, degrees: number): Vec2 {
  const radians = (degrees * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: point.x * cosine - point.y * sine,
    y: point.x * sine + point.y * cosine,
  };
}

function applyTransform(point: Vec2, transform: Transform2D): Vec2 {
  const rotated = rotate(
    { x: point.x * transform.scale.x, y: point.y * transform.scale.y },
    transform.rotation,
  );
  return {
    x: rotated.x + transform.translation.x,
    y: rotated.y + transform.translation.y,
  };
}

function localObjectPoints(object: BoardObject): readonly Vec2[] {
  switch (object.kind) {
    case "drawing.pen-stroke":
      return object.points;
    case "drawing.line":
      return [{ x: 0, y: 0 }, object.end];
    case "drawing.rectangle":
    case "svg-import.svg":
    case "media.image":
      return [
        { x: 0, y: 0 },
        { x: object.size.width, y: 0 },
        { x: object.size.width, y: object.size.height },
        { x: 0, y: object.size.height },
      ];
    case "drawing.ellipse":
      return [
        { x: -object.radius.x, y: -object.radius.y },
        { x: object.radius.x, y: -object.radius.y },
        { x: object.radius.x, y: object.radius.y },
        { x: -object.radius.x, y: object.radius.y },
      ];
    case "drawing.text": {
      const lines = object.text.split(/\r?\n/u);
      return [
        { x: 0, y: 0 },
        {
          x: Math.max(1, ...lines.map((line) => line.length)) * 14,
          y: Math.max(1, lines.length) * 30,
        },
      ];
    }
  }
}

function itemBounds(item: BoardRenderItem) {
  const objectTransform: Transform2D = {
    rotation: item.object.rotation,
    scale: item.object.scale,
    translation: item.object.position,
  };
  const points = localObjectPoints(item.object).map((point) => {
    let transformed = applyTransform(point, objectTransform);
    for (let index = item.transforms.length - 1; index >= 0; index -= 1) {
      transformed = applyTransform(transformed, item.transforms[index]!);
    }
    return transformed;
  });
  const xs = points.map(({ x }) => x);
  const ys = points.map(({ y }) => y);
  const margin = Math.max(2, item.object.style.strokeWidth);
  return {
    bottom: Math.max(...ys) + margin,
    left: Math.min(...xs) - margin,
    right: Math.max(...xs) + margin,
    top: Math.min(...ys) - margin,
  };
}

export function selectVisibleBoardItems(
  items: readonly BoardRenderItem[],
  viewport: ViewportState,
  size: BoardViewportSize,
): readonly BoardRenderItem[] {
  const overscan = Math.max(0, size.overscan ?? 160);
  const left = (-viewport.offset.x - overscan) / viewport.zoom;
  const top = (-viewport.offset.y - overscan) / viewport.zoom;
  const right = (size.width - viewport.offset.x + overscan) / viewport.zoom;
  const bottom = (size.height - viewport.offset.y + overscan) / viewport.zoom;
  return items.filter((item) => {
    if (!item.object.visible) {
      return false;
    }
    const bounds = itemBounds(item);
    return (
      bounds.right >= left &&
      bounds.left <= right &&
      bounds.bottom >= top &&
      bounds.top <= bottom
    );
  });
}

export function batchBoardRenderItems(
  items: readonly BoardRenderItem[],
  maximumBatchSize = 250,
): readonly (readonly BoardRenderItem[])[] {
  if (!Number.isInteger(maximumBatchSize) || maximumBatchSize <= 0) {
    throw new RangeError("Render batch size must be a positive integer.");
  }
  const batches: BoardRenderItem[][] = [];
  for (let index = 0; index < items.length; index += maximumBatchSize) {
    batches.push(items.slice(index, index + maximumBatchSize));
  }
  return batches;
}
