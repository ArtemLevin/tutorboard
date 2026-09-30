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
    case "media.asset":
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

function pointToSegmentDistance(
  point: Vec2,
  start: Vec2,
  finish: Vec2,
): number {
  const dx = finish.x - start.x;
  const dy = finish.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= geometryEpsilon) return pointDistance(point, start);
  const ratio = Math.min(
    1,
    Math.max(
      0,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
    ),
  );
  return pointDistance(point, {
    x: start.x + dx * ratio,
    y: start.y + dy * ratio,
  });
}

function pathDistanceToPoint(path: SelectionPath, point: Vec2): number {
  const segments = pathSegments(path);
  if (segments.length === 0) {
    return path.points[0] === undefined
      ? Number.POSITIVE_INFINITY
      : pointDistance(point, path.points[0]);
  }
  return Math.min(
    ...segments.map(([start, finish]) =>
      pointToSegmentDistance(point, start, finish),
    ),
  );
}

function selectableInterior(object: BoardObject): boolean {
  if (object.style.fill !== null) return true;
  return (
    object.kind === "drawing.text" ||
    object.kind === "image.embedded" ||
    object.kind === "media.asset" ||
    object.kind === "svg-import.svg" ||
    object.kind === "math.coordinate-plot"
  );
}

function segmentDistance(
  leftStart: Vec2,
  leftFinish: Vec2,
  rightStart: Vec2,
  rightFinish: Vec2,
): number {
  if (segmentsIntersect(leftStart, leftFinish, rightStart, rightFinish)) {
    return 0;
  }
  return Math.min(
    pointToSegmentDistance(leftStart, rightStart, rightFinish),
    pointToSegmentDistance(leftFinish, rightStart, rightFinish),
    pointToSegmentDistance(rightStart, leftStart, leftFinish),
    pointToSegmentDistance(rightFinish, leftStart, leftFinish),
  );
}

function pathDistanceToPath(
  left: SelectionPath,
  right: SelectionPath,
): number {
  const leftSegments = pathSegments(left);
  const rightSegments = pathSegments(right);
  if (leftSegments.length === 0) {
    const point = left.points[0];
    return point === undefined
      ? Number.POSITIVE_INFINITY
      : pathDistanceToPoint(right, point);
  }
  if (rightSegments.length === 0) {
    const point = right.points[0];
    return point === undefined
      ? Number.POSITIVE_INFINITY
      : pathDistanceToPoint(left, point);
  }
  let minimum = Number.POSITIVE_INFINITY;
  for (const [leftStart, leftFinish] of leftSegments) {
    for (const [rightStart, rightFinish] of rightSegments) {
      minimum = Math.min(
        minimum,
        segmentDistance(leftStart, leftFinish, rightStart, rightFinish),
      );
      if (minimum <= geometryEpsilon) return 0;
    }
  }
  return minimum;
}

export function selectObjectIdsNearPath(
  scene: BoardSceneReadModel,
  rawPoints: readonly Vec2[],
  tolerance: number,
): readonly BoardObjectId[] {
  const points = rawPoints.filter(finitePoint).slice(0, maximumLassoPoints);
  if (
    points.length === 0 ||
    !Number.isFinite(tolerance) ||
    tolerance < 0
  ) {
    return [];
  }
  const brushPath: SelectionPath = { closed: false, points };
  return scene.items
    .filter((item) => {
      if (!item.object.visible) return false;
      const objectPath = transformedSelectionPath(item);
      if (
        objectPath.closed &&
        selectableInterior(item.object) &&
        points.some((point) => pointInPolygon(point, objectPath.points))
      ) {
        return true;
      }
      return pathDistanceToPath(objectPath, brushPath) <= tolerance;
    })
    .map((item) => item.object.id);
}

export function selectTopObjectIdNearPoint(
  scene: BoardSceneReadModel,
  point: Vec2,
  tolerance: number,
): BoardObjectId | null {
  if (!finitePoint(point) || !Number.isFinite(tolerance) || tolerance < 0) {
    return null;
  }
  for (let index = scene.items.length - 1; index >= 0; index -= 1) {
    const item = scene.items[index];
    if (item === undefined || !item.object.visible) continue;
    const path = transformedSelectionPath(item);
    if (
      path.closed &&
      selectableInterior(item.object) &&
      pointInPolygon(point, path.points)
    ) {
      return item.object.id;
    }
    if (pathDistanceToPoint(path, point) <= tolerance) {
      return item.object.id;
    }
  }
  return null;
}

export function aggregateSelectionBounds(
  bounds: readonly SelectionBounds[],
  padding = 0,
): Rect2 | null {
  if (bounds.length === 0 || !Number.isFinite(padding) || padding < 0) {
    return null;
  }
  const left = Math.min(...bounds.map(({ rect }) => rect.x)) - padding;
  const top = Math.min(...bounds.map(({ rect }) => rect.y)) - padding;
  const right =
    Math.max(...bounds.map(({ rect }) => rect.x + rect.width)) + padding;
  const bottom =
    Math.max(...bounds.map(({ rect }) => rect.y + rect.height)) + padding;
  return {
    height: bottom - top,
    width: right - left,
    x: left,
    y: top,
  };
}

export function pointInSelectionBounds(point: Vec2, rect: Rect2): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}
