import type {
  BoardRenderItem,
  LineObject,
  Transform2D,
  Vec2,
} from "../../core/public";
import type { SelectionObjectTransform } from "./commands";

export type LineEndpoint = "end" | "start";

export interface LineWorldEndpoints {
  readonly end: Vec2;
  readonly start: Vec2;
}

const geometryEpsilon = 1e-9;

function rotate(point: Vec2, degrees: number): Vec2 {
  const radians = (degrees * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: point.x * cosine - point.y * sine,
    y: point.x * sine + point.y * cosine,
  };
}

function transformPoint(point: Vec2, transform: Transform2D): Vec2 {
  const rotated = rotate(
    {
      x: point.x * transform.scale.x,
      y: point.y * transform.scale.y,
    },
    transform.rotation,
  );
  return {
    x: rotated.x + transform.translation.x,
    y: rotated.y + transform.translation.y,
  };
}

function inverseTransformPoint(
  point: Vec2,
  transform: Transform2D,
): Vec2 | null {
  if (
    Math.abs(transform.scale.x) <= geometryEpsilon ||
    Math.abs(transform.scale.y) <= geometryEpsilon
  ) {
    return null;
  }
  const translated = {
    x: point.x - transform.translation.x,
    y: point.y - transform.translation.y,
  };
  const unrotated = rotate(translated, -transform.rotation);
  return {
    x: unrotated.x / transform.scale.x,
    y: unrotated.y / transform.scale.y,
  };
}

function objectTransform(line: LineObject): Transform2D {
  return {
    rotation: line.rotation,
    scale: line.scale,
    translation: line.position,
  };
}

function applyParentTransforms(
  point: Vec2,
  transforms: readonly Transform2D[],
): Vec2 {
  return [...transforms]
    .reverse()
    .reduce((current, transform) => transformPoint(current, transform), point);
}

function invertParentTransforms(
  point: Vec2,
  transforms: readonly Transform2D[],
): Vec2 | null {
  let current = point;
  for (const transform of transforms) {
    const inverted = inverseTransformPoint(current, transform);
    if (inverted === null) return null;
    current = inverted;
  }
  return current;
}

function distance(left: Vec2, right: Vec2): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function normalizeTransformValue(value: number): number {
  const normalized = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(normalized, -0) ? 0 : normalized;
}

function normalizeRotation(rotation: number): number {
  const normalized = ((((rotation + 180) % 360) + 360) % 360) - 180;
  return normalizeTransformValue(normalized);
}

function finitePoint(point: Vec2): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

export function lineWorldEndpoints(item: BoardRenderItem): LineWorldEndpoints | null {
  if (item.object.kind !== "drawing.line") return null;
  const line = item.object;
  const transform = objectTransform(line);
  const startInParent = transformPoint({ x: 0, y: 0 }, transform);
  const endInParent = transformPoint(line.end, transform);
  return {
    start: applyParentTransforms(startInParent, item.transforms),
    end: applyParentTransforms(endInParent, item.transforms),
  };
}

export function createLineEndpointRotationTransform(
  item: BoardRenderItem,
  draggedEndpoint: LineEndpoint,
  pointerWorld: Vec2,
): SelectionObjectTransform | null {
  if (item.object.kind !== "drawing.line" || !finitePoint(pointerWorld)) {
    return null;
  }

  const line = item.object;
  const endpoints = lineWorldEndpoints(item);
  if (endpoints === null) return null;
  const fixedWorld =
    draggedEndpoint === "end" ? endpoints.start : endpoints.end;
  const currentMovingWorld =
    draggedEndpoint === "end" ? endpoints.end : endpoints.start;
  const worldLength = distance(fixedWorld, currentMovingWorld);
  const pointerVector = {
    x: pointerWorld.x - fixedWorld.x,
    y: pointerWorld.y - fixedWorld.y,
  };
  const pointerDistance = Math.hypot(pointerVector.x, pointerVector.y);
  if (
    worldLength <= geometryEpsilon ||
    pointerDistance <= geometryEpsilon
  ) {
    return null;
  }

  const desiredMovingWorld = {
    x: fixedWorld.x + (pointerVector.x / pointerDistance) * worldLength,
    y: fixedWorld.y + (pointerVector.y / pointerDistance) * worldLength,
  };
  const fixedParent = invertParentTransforms(fixedWorld, item.transforms);
  const movingParent = invertParentTransforms(
    desiredMovingWorld,
    item.transforms,
  );
  if (fixedParent === null || movingParent === null) return null;

  const desiredStart =
    draggedEndpoint === "end" ? fixedParent : movingParent;
  const desiredEnd =
    draggedEndpoint === "end" ? movingParent : fixedParent;
  const targetVector = {
    x: desiredEnd.x - desiredStart.x,
    y: desiredEnd.y - desiredStart.y,
  };
  const scaledLocalEnd = {
    x: line.end.x * line.scale.x,
    y: line.end.y * line.scale.y,
  };
  const baseLength = Math.hypot(scaledLocalEnd.x, scaledLocalEnd.y);
  const targetLength = Math.hypot(targetVector.x, targetVector.y);
  if (
    baseLength <= geometryEpsilon ||
    targetLength <= geometryEpsilon
  ) {
    return null;
  }

  const scaleFactor = targetLength / baseLength;
  const rotation =
    (Math.atan2(targetVector.y, targetVector.x) * 180) / Math.PI -
    (Math.atan2(scaledLocalEnd.y, scaledLocalEnd.x) * 180) / Math.PI;
  const result: SelectionObjectTransform = {
    objectId: line.id,
    position: {
      x: normalizeTransformValue(desiredStart.x),
      y: normalizeTransformValue(desiredStart.y),
    },
    rotation: normalizeRotation(rotation),
    scale: {
      x: normalizeTransformValue(line.scale.x * scaleFactor),
      y: normalizeTransformValue(line.scale.y * scaleFactor),
    },
  };

  if (
    !finitePoint(result.position) ||
    !finitePoint(result.scale) ||
    !Number.isFinite(result.rotation) ||
    result.scale.x <= 0 ||
    result.scale.y <= 0
  ) {
    return null;
  }
  return result;
}
