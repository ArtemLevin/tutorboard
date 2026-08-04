import {
  boardObjectId,
  type AddObjectsCommand,
  type BoardDocument,
  type BoardObject,
  type BoardObjectId,
  type CommandMetadata,
  type GroupId,
  type SetGroupTransformCommand,
  type Vec2,
} from "../../core/public";

import {
  textShapeIdentityFromGroupId,
  textShapeLabelNameFromObjectId,
  textShapeVertexNameFromObjectId,
} from "./templates";
import { inspectTextShapeFigure } from "./vertex-constructions";

const pointStyle = {
  fill: "#7c3aed",
  opacity: 1,
  stroke: "#ffffff",
  strokeWidth: 1,
} as const;
const labelStyle = {
  fill: "#5b21b6",
  opacity: 1,
  stroke: null,
  strokeWidth: 0,
} as const;
const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function inverseTransform(
  point: Vec2,
  transform: {
    readonly rotation: number;
    readonly scale: Vec2;
    readonly translation: Vec2;
  },
): Vec2 {
  const translated = {
    x: point.x - transform.translation.x,
    y: point.y - transform.translation.y,
  };
  const radians = (-transform.rotation * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const rotated = {
    x: translated.x * cosine - translated.y * sine,
    y: translated.x * sine + translated.y * cosine,
  };
  return {
    x: rotated.x / transform.scale.x,
    y: rotated.y / transform.scale.y,
  };
}

function projectSegment(point: Vec2, start: Vec2, finish: Vec2): Vec2 {
  const dx = finish.x - start.x;
  const dy = finish.y - start.y;
  const denominator = dx * dx + dy * dy;
  if (denominator === 0) return start;
  const progress = Math.min(
    1,
    Math.max(
      0,
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / denominator,
    ),
  );
  return { x: start.x + dx * progress, y: start.y + dy * progress };
}

function projectPolyline(point: Vec2, points: readonly Vec2[]): Vec2 | null {
  let nearest: { readonly distance: number; readonly point: Vec2 } | undefined;
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const finish = points[index];
    if (start === undefined || finish === undefined) continue;
    const projected = projectSegment(point, start, finish);
    const distance = Math.hypot(point.x - projected.x, point.y - projected.y);
    if (nearest === undefined || distance < nearest.distance) {
      nearest = { distance, point: projected };
    }
  }
  return nearest?.point ?? null;
}

function contourPoint(object: BoardObject, point: Vec2): Vec2 | null {
  if (object.kind === "drawing.line") {
    return projectSegment(point, object.position, {
      x: object.position.x + object.end.x,
      y: object.position.y + object.end.y,
    });
  }
  if (object.kind === "drawing.ellipse") {
    const dx = point.x - object.position.x;
    const dy = point.y - object.position.y;
    const denominator = Math.sqrt(
      (dx * dx) / (object.radius.x * object.radius.x) +
        (dy * dy) / (object.radius.y * object.radius.y),
    );
    if (!Number.isFinite(denominator) || denominator === 0) {
      return { x: object.position.x + object.radius.x, y: object.position.y };
    }
    return {
      x: object.position.x + dx / denominator,
      y: object.position.y + dy / denominator,
    };
  }
  if (object.kind === "drawing.pen-stroke") {
    return projectPolyline(
      point,
      object.points.map((item) => ({
        x: object.position.x + item.x,
        y: object.position.y + item.y,
      })),
    );
  }
  return null;
}

function isGeneratedContour(object: BoardObject): boolean {
  return (
    /object:text-shape:[^:]+:(?:edge|ellipse|curve):/u.test(object.id) &&
    (object.kind === "drawing.line" ||
      object.kind === "drawing.ellipse" ||
      object.kind === "drawing.pen-stroke")
  );
}

function nextPointName(
  document: BoardDocument,
  objectIds: readonly BoardObjectId[],
) {
  const used = new Set(
    objectIds.flatMap((id) => {
      const name =
        textShapeVertexNameFromObjectId(id) ??
        textShapeLabelNameFromObjectId(id);
      return name === null ? [] : [name];
    }),
  );
  for (const letter of letters) {
    if (!used.has(letter)) return letter;
  }
  for (let suffix = 1; suffix < 10_000; suffix += 1) {
    for (const letter of letters) {
      const candidate = `${letter}${String(suffix)}`;
      if (!used.has(candidate)) return candidate;
    }
  }
  return `P${String(document.order.length + 1)}`;
}

export function createTextShapeContourPointCommand(input: {
  readonly document: BoardDocument;
  readonly hitObjectId: BoardObjectId;
  readonly metadata: CommandMetadata;
  readonly token: string;
  readonly worldPoint: Vec2;
}): AddObjectsCommand | null {
  const hitObject = input.document.objects[input.hitObjectId];
  const groupId = hitObject?.groupId;
  if (
    hitObject === undefined ||
    groupId === null ||
    groupId === undefined ||
    !isGeneratedContour(hitObject)
  ) {
    return null;
  }
  const identity = textShapeIdentityFromGroupId(groupId);
  const group = input.document.groups[groupId];
  if (identity === null || group === undefined || group.locked) return null;
  const localPoint = inverseTransform(input.worldPoint, group.transform);
  const projected = contourPoint(hitObject, localPoint);
  if (projected === null) return null;
  const name = nextPointName(input.document, group.objectIds);
  const prefix = `object:text-shape-manual:${input.token}`;
  const pointId = boardObjectId(`${prefix}:point:${name}`);
  const labelId = boardObjectId(`${prefix}:label:${name}`);
  const figure = inspectTextShapeFigure(input.document, [input.hitObjectId]);
  const base = {
    groupId,
    locked: false,
    rotation: 0,
    scale: { x: 1, y: 1 },
    source: { kind: "user" as const },
    visible: true,
  };
  return {
    ...input.metadata,
    kind: "core.objects.add",
    objects: [
      {
        ...base,
        id: pointId,
        kind: "drawing.ellipse",
        position: projected,
        radius: { x: 4.5, y: 4.5 },
        style: pointStyle,
      },
      {
        ...base,
        id: labelId,
        kind: "drawing.text",
        position: { x: projected.x + 9, y: projected.y - 14 },
        style: labelStyle,
        text: name,
        visible: figure?.labelsVisible ?? true,
      },
    ],
  };
}

function normalizeRotation(value: number): number {
  const normalized = ((((value + 180) % 360) + 360) % 360) - 180;
  return Object.is(normalized, -0) ? 0 : normalized;
}

export function createTextShapeGroupTransformCommand(input: {
  readonly document: BoardDocument;
  readonly groupId: GroupId;
  readonly metadata: CommandMetadata;
  readonly rotationDelta: number;
  readonly scaleFactor: number;
}): SetGroupTransformCommand | null {
  const group = input.document.groups[input.groupId];
  if (
    group === undefined ||
    group.locked ||
    textShapeIdentityFromGroupId(group.id) === null ||
    !Number.isFinite(input.rotationDelta) ||
    !Number.isFinite(input.scaleFactor) ||
    input.scaleFactor <= 0
  ) {
    return null;
  }
  return {
    ...input.metadata,
    groupId: group.id,
    kind: "core.groups.set-transform",
    transform: {
      ...group.transform,
      rotation: normalizeRotation(
        group.transform.rotation + input.rotationDelta,
      ),
      scale: {
        x: Math.min(
          20,
          Math.max(0.08, group.transform.scale.x * input.scaleFactor),
        ),
        y: Math.min(
          20,
          Math.max(0.08, group.transform.scale.y * input.scaleFactor),
        ),
      },
    },
  };
}
