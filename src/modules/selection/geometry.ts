import type {
  BoardObject,
  BoardObjectId,
  BoardRenderItem,
  BoardSceneReadModel,
  Transform2D,
  Vec2,
} from "../../core/public";
import type { Rect2 } from "./interaction";

interface SelectionPath {
  readonly closed: boolean;
  readonly points: readonly Vec2[];
}

const geometryEpsilon = 1e-7;
const minimumLassoArea = 4;
const maximumLassoPoints = 4096;

function finitePoint(point: Vec2): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function pointDistance(left: Vec2, right: Vec2): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

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

function rectanglePoints(rect: Rect2): readonly Vec2[] {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height },
  ];
}

function textBounds(
  object: Extract<BoardObject, { kind: "drawing.text" }>,
): Rect2 {
  const lines = object.text.split(/\r?\n/u);
  return {
    height: Math.max(1, lines.length) * 29.7,
    width: Math.max(1, ...lines.map((line) => line.length)) * 13.2,
    x: 0,
    y: 0,
  };
}

function localSelectionPath(object: BoardObject): SelectionPath {
  switch (object.kind) {
    case "drawing.pen-stroke": {
      const points = object.points.filter(finitePoint);
      if (points.length === 0) {
        return { closed: false, points: [{ x: 0, y: 0 }] };
      }
      const first = points[0]!;
      const last = points.at(-1)!;
      return {
        closed:
          points.length >= 3 &&
          pointDistance(first, last) <= Math.max(2, object.style.strokeWidth),
        points,
      };
    }
    case "drawing.line":
      return { closed: false, points: [{ x: 0, y: 0 }, object.end] };
    case "drawing.rectangle":
    case "math.coordinate-plot":
    case "image.embedded":
    case "svg-import.svg":
      return {
        closed: true,
        points: rectanglePoints({
          x: 0,
          y: 0,
          ...(object.kind === "math.coordinate-plot"
            ? object.definition.size
            : object.size),
        }),
      };
    case "drawing.ellipse": {
      const samples = Math.min(
        96,
        Math.max(36, Math.ceil(Math.max(object.radius.x, object.radius.y) / 3)),
      );
      return {
        closed: true,
        points: Array.from({ length: samples }, (_, index) => {
          const angle = (index / samples) * Math.PI * 2;
          return {
            x: Math.cos(angle) * object.radius.x,
            y: Math.sin(angle) * object.radius.y,
          };
        }),
      };
    }
    case "drawing.text":
      return { closed: true, points: rectanglePoints(textBounds(object)) };
  }
}

function transformedSelectionPath(item: BoardRenderItem): SelectionPath {
  const local = localSelectionPath(item.object);
  const transforms = [
    objectTransform(item.object),
    ...[...item.transforms].reverse(),
  ];
  return {
    closed: local.closed,
    points: local.points.map((point) =>
      transforms.reduce(
        (current, transform) => transformPoint(current, transform),
        point,
      ),
    ),
  };
}

function localBounds(object: BoardObject): Rect2 {
  const points = localSelectionPath(object).points;
  const xs = points.map(({ x }) => x);
  const ys = points.map(({ y }) => y);
  return {
    height: Math.max(...ys) - Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    x: Math.min(...xs),
    y: Math.min(...ys),
  };
}

function itemBounds(item: BoardRenderItem): Rect2 {
  const transforms = [
    objectTransform(item.object),
    ...[...item.transforms].reverse(),
  ];
  const points = rectanglePoints(localBounds(item.object)).map((point) =>
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

function crossProduct(origin: Vec2, first: Vec2, second: Vec2): number {
  return (
    (first.x - origin.x) * (second.y - origin.y) -
    (first.y - origin.y) * (second.x - origin.x)
  );
}

function pointOnSegment(point: Vec2, start: Vec2, finish: Vec2): boolean {
  if (Math.abs(crossProduct(start, finish, point)) > geometryEpsilon) {
    return false;
  }
  return (
    point.x >= Math.min(start.x, finish.x) - geometryEpsilon &&
    point.x <= Math.max(start.x, finish.x) + geometryEpsilon &&
    point.y >= Math.min(start.y, finish.y) - geometryEpsilon &&
    point.y <= Math.max(start.y, finish.y) + geometryEpsilon
  );
}

function segmentsIntersect(
  leftStart: Vec2,
  leftFinish: Vec2,
  rightStart: Vec2,
  rightFinish: Vec2,
): boolean {
  const leftRightStart = crossProduct(leftStart, leftFinish, rightStart);
  const leftRightFinish = crossProduct(leftStart, leftFinish, rightFinish);
  const rightLeftStart = crossProduct(rightStart, rightFinish, leftStart);
  const rightLeftFinish = crossProduct(rightStart, rightFinish, leftFinish);

  if (
    ((leftRightStart > geometryEpsilon && leftRightFinish < -geometryEpsilon) ||
      (leftRightStart < -geometryEpsilon &&
        leftRightFinish > geometryEpsilon)) &&
    ((rightLeftStart > geometryEpsilon && rightLeftFinish < -geometryEpsilon) ||
      (rightLeftStart < -geometryEpsilon && rightLeftFinish > geometryEpsilon))
  ) {
    return true;
  }

  return (
    pointOnSegment(rightStart, leftStart, leftFinish) ||
    pointOnSegment(rightFinish, leftStart, leftFinish) ||
    pointOnSegment(leftStart, rightStart, rightFinish) ||
    pointOnSegment(leftFinish, rightStart, rightFinish)
  );
}

export function pointInPolygon(point: Vec2, polygon: readonly Vec2[]): boolean {
  if (polygon.length < 3) {
    return false;
  }
  let inside = false;
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index]!;
    const previous = polygon[(index + polygon.length - 1) % polygon.length]!;
    if (pointOnSegment(point, previous, current)) {
      return true;
    }
    const crossesRay =
      current.y > point.y !== previous.y > point.y &&
      point.x <
        ((previous.x - current.x) * (point.y - current.y)) /
          (previous.y - current.y) +
          current.x;
    if (crossesRay) {
      inside = !inside;
    }
  }
  return inside;
}

export function lassoPolygonArea(points: readonly Vec2[]): number {
  if (points.length < 3) {
    return 0;
  }
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    area += current.x * next.y - next.x * current.y;
  }
  return Math.abs(area) / 2;
}

export function normalizeLassoPoints(points: readonly Vec2[]): readonly Vec2[] {
  const normalized: Vec2[] = [];
  for (const point of points.slice(0, maximumLassoPoints)) {
    if (!finitePoint(point)) {
      continue;
    }
    const previous = normalized.at(-1);
    if (
      previous === undefined ||
      pointDistance(previous, point) > geometryEpsilon
    ) {
      normalized.push(point);
    }
  }
  if (
    normalized.length > 2 &&
    pointDistance(normalized[0]!, normalized.at(-1)!) <= geometryEpsilon
  ) {
    normalized.pop();
  }
  return normalized;
}

function pathSegments(path: SelectionPath): readonly (readonly [Vec2, Vec2])[] {
  if (path.points.length < 2) {
    return [];
  }
  const segments: [Vec2, Vec2][] = [];
  for (let index = 1; index < path.points.length; index += 1) {
    segments.push([path.points[index - 1]!, path.points[index]!]);
  }
  if (path.closed) {
    segments.push([path.points.at(-1)!, path.points[0]!]);
  }
  return segments;
}

function pathIntersectsPolygon(
  path: SelectionPath,
  polygon: readonly Vec2[],
): boolean {
  if (path.points.some((point) => pointInPolygon(point, polygon))) {
    return true;
  }
  if (
    path.closed &&
    polygon.some((point) => pointInPolygon(point, path.points))
  ) {
    return true;
  }

  const polygonPath: SelectionPath = { closed: true, points: polygon };
  const objectSegments = pathSegments(path);
  const polygonSegments = pathSegments(polygonPath);
  return objectSegments.some(([objectStart, objectFinish]) =>
    polygonSegments.some(([lassoStart, lassoFinish]) =>
      segmentsIntersect(objectStart, objectFinish, lassoStart, lassoFinish),
    ),
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

export function selectObjectIdsInLasso(
  scene: BoardSceneReadModel,
  rawPoints: readonly Vec2[],
): readonly BoardObjectId[] {
  const polygon = normalizeLassoPoints(rawPoints);
  if (polygon.length < 3 || lassoPolygonArea(polygon) < minimumLassoArea) {
    return [];
  }
  return scene.items
    .filter(
      (item) =>
        item.object.visible &&
        pathIntersectsPolygon(transformedSelectionPath(item), polygon),
    )
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
