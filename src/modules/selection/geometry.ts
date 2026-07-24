import type {
  BoardObject,
  BoardObjectId,
  BoardRenderItem,
  BoardSceneReadModel,
  Transform2D,
  Vec2,
} from "../../core/public";
import { normalizeRect, type Rect2 } from "./interaction";

function transformPoint(point: Vec2, transform: Transform2D): Vec2 {
  const scaled = {
    x: point.x * transform.scale.x,
    y: point.y * transform.scale.y,
  };
  const radians = (transform.rotation * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: scaled.x * cosine - scaled.y * sine + transform.translation.x,
    y: scaled.x * sine + scaled.y * cosine + transform.translation.y,
  };
}

function objectTransform(object: BoardObject): Transform2D {
  return {
    rotation: object.rotation,
    scale: object.scale,
    translation: object.position,
  };
}

function localBounds(object: BoardObject): Rect2 {
  switch (object.kind) {
    case "drawing.pen-stroke": {
      const xs = object.points.map(({ x }) => x);
      const ys = object.points.map(({ y }) => y);
      return normalizeRect(
        { x: Math.min(...xs), y: Math.min(...ys) },
        { x: Math.max(...xs), y: Math.max(...ys) },
      );
    }
    case "drawing.line":
      return normalizeRect({ x: 0, y: 0 }, object.end);
    case "drawing.rectangle":
      return { x: 0, y: 0, ...object.size };
    case "drawing.ellipse":
      return {
        height: object.radius.y * 2,
        width: object.radius.x * 2,
        x: -object.radius.x,
        y: -object.radius.y,
      };
    case "drawing.text": {
      const lines = object.text.split("\n");
      return {
        height: Math.max(1, lines.length) * 29.7,
        width: Math.max(1, ...lines.map((line) => line.length)) * 13.2,
        x: 0,
        y: 0,
      };
    }
  }
}

function corners(rect: Rect2): readonly Vec2[] {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
}

function itemBounds(item: BoardRenderItem): Rect2 {
  const transforms = [
    objectTransform(item.object),
    ...[...item.transforms].reverse(),
  ];
  const points = corners(localBounds(item.object)).map((point) =>
    transforms.reduce(
      (current, transform) => transformPoint(current, transform),
      point,
    ),
  );
  const xs = points.map(({ x }) => x);
  const ys = points.map(({ y }) => y);
  const padding = item.object.style.strokeWidth / 2;
  return {
    height: Math.max(...ys) - Math.min(...ys) + padding * 2,
    width: Math.max(...xs) - Math.min(...xs) + padding * 2,
    x: Math.min(...xs) - padding,
    y: Math.min(...ys) - padding,
  };
}

function intersects(left: Rect2, right: Rect2): boolean {
  return (
    left.x <= right.x + right.width &&
    left.x + left.width >= right.x &&
    left.y <= right.y + right.height &&
    left.y + left.height >= right.y
  );
}

export interface SelectionBounds {
  readonly id: BoardObjectId;
  readonly rect: Rect2;
}

export function selectObjectIdsInRect(
  scene: BoardSceneReadModel,
  rect: Rect2,
): readonly BoardObjectId[] {
  return scene.items
    .filter((item) => item.object.visible && intersects(itemBounds(item), rect))
    .map((item) => item.object.id);
}

export function selectSelectionBounds(
  scene: BoardSceneReadModel,
  objectIds: readonly BoardObjectId[],
): readonly SelectionBounds[] {
  const selected = new Set(objectIds);
  return scene.items
    .filter((item) => selected.has(item.object.id))
    .map((item) => ({ id: item.object.id, rect: itemBounds(item) }));
}
