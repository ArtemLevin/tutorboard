import {
  boardObjectId,
  type AddObjectsCommand,
  type BoardDocument,
  type BoardObject,
  type BoardObjectId,
  type BoardSceneReadModel,
  type CommandMetadata,
  type GroupId,
  type ObjectStyle,
  type Vec2,
} from "../../core/public";

import {
  textShapeIdentityFromGroupId,
  textShapeLabelNameFromObjectId,
  textShapeVertexNameFromObjectId,
} from "./templates";

export type VertexConstructionKind = "altitude" | "angle-bisector" | "median";

export interface TextShapeFigureContext {
  readonly definitionId: string;
  readonly groupId: GroupId;
  readonly labelObjectIds: readonly BoardObjectId[];
  readonly labelsVisible: boolean;
}

export interface TextShapeVertexContext extends TextShapeFigureContext {
  readonly availableConstructions: readonly VertexConstructionKind[];
  readonly vertexName: string;
  readonly vertexObjectId: BoardObjectId;
}

const constructionStyle: ObjectStyle = {
  fill: null,
  opacity: 1,
  stroke: "#9f3f55",
  strokeWidth: 2.5,
};
const pointStyle: ObjectStyle = {
  fill: "#9f3f55",
  opacity: 1,
  stroke: "#ffffff",
  strokeWidth: 1,
};
const labelStyle: ObjectStyle = {
  fill: "#7f2941",
  opacity: 1,
  stroke: null,
  strokeWidth: 0,
};

function figureContext(
  document: BoardDocument,
  groupId: GroupId,
): TextShapeFigureContext | null {
  const identity = textShapeIdentityFromGroupId(groupId);
  const group = document.groups[groupId];
  if (identity === null || group === undefined) return null;
  const labelObjectIds = group.objectIds.filter(
    (id) => textShapeLabelNameFromObjectId(id) !== null,
  );
  return {
    definitionId: identity.definitionId,
    groupId,
    labelObjectIds,
    labelsVisible:
      labelObjectIds.length > 0 &&
      labelObjectIds.every((id) => document.objects[id]?.visible === true),
  };
}

export function inspectTextShapeFigure(
  document: BoardDocument,
  selectedObjectIds: readonly BoardObjectId[],
): TextShapeFigureContext | null {
  const groupIds = new Set(
    selectedObjectIds.flatMap((id) => {
      const value = document.objects[id]?.groupId;
      return value === null || value === undefined ? [] : [value];
    }),
  );
  if (groupIds.size !== 1) return null;
  return figureContext(document, [...groupIds][0]!);
}

function triangleDefinition(definitionId: string): boolean {
  return definitionId === "triangle" || definitionId.endsWith("-triangle");
}

export function inspectTextShapeVertex(
  document: BoardDocument,
  objectId: BoardObjectId,
): TextShapeVertexContext | null {
  const vertexName = textShapeVertexNameFromObjectId(objectId);
  const object = document.objects[objectId];
  if (
    vertexName === null ||
    object?.kind !== "drawing.ellipse" ||
    object.groupId === null
  ) {
    return null;
  }
  const figure = figureContext(document, object.groupId);
  if (figure === null || !triangleDefinition(figure.definitionId)) return null;
  return {
    ...figure,
    availableConstructions: ["altitude", "median", "angle-bisector"],
    vertexName,
    vertexObjectId: objectId,
  };
}

function transformPoint(
  point: Vec2,
  transform: {
    readonly rotation: number;
    readonly scale: Vec2;
    readonly translation: Vec2;
  },
): Vec2 {
  const radians = (transform.rotation * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const scaled = {
    x: point.x * transform.scale.x,
    y: point.y * transform.scale.y,
  };
  return {
    x: scaled.x * cosine - scaled.y * sine + transform.translation.x,
    y: scaled.x * sine + scaled.y * cosine + transform.translation.y,
  };
}

function itemWorldPosition(item: BoardSceneReadModel["items"][number]): Vec2 {
  return [...item.transforms]
    .reverse()
    .reduce(
      (point, transform) => transformPoint(point, transform),
      item.object.position,
    );
}

export function inspectTextShapeVertexNearPoint(input: {
  readonly document: BoardDocument;
  readonly hitObjectId: BoardObjectId;
  readonly maximumDistance: number;
  readonly point: Vec2;
  readonly scene: BoardSceneReadModel;
}): TextShapeVertexContext | null {
  const direct = inspectTextShapeVertex(input.document, input.hitObjectId);
  if (direct !== null) return direct;
  const groupId = input.document.objects[input.hitObjectId]?.groupId;
  if (groupId === null || groupId === undefined) return null;

  let nearest:
    | { readonly context: TextShapeVertexContext; readonly distance: number }
    | undefined;
  for (const item of input.scene.items) {
    if (item.object.groupId !== groupId) continue;
    const context = inspectTextShapeVertex(input.document, item.object.id);
    if (context === null) continue;
    const position = itemWorldPosition(item);
    const distance = Math.hypot(
      input.point.x - position.x,
      input.point.y - position.y,
    );
    if (
      distance <= input.maximumDistance &&
      (nearest === undefined || distance < nearest.distance)
    ) {
      nearest = { context, distance };
    }
  }
  return nearest?.context ?? null;
}

function vertexObjects(
  document: BoardDocument,
  groupId: GroupId,
): readonly {
  readonly name: string;
  readonly object: BoardObject & { kind: "drawing.ellipse" };
}[] {
  const group = document.groups[groupId];
  if (group === undefined) return [];
  return group.objectIds
    .flatMap((id) => {
      const name = textShapeVertexNameFromObjectId(id);
      const object = document.objects[id];
      return name !== null && object?.kind === "drawing.ellipse"
        ? [{ name, object }]
        : [];
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

function subtract(left: Vec2, right: Vec2): Vec2 {
  return { x: left.x - right.x, y: left.y - right.y };
}

function distance(left: Vec2, right: Vec2): number {
  return Math.hypot(right.x - left.x, right.y - left.y);
}

function altitudeFoot(vertex: Vec2, first: Vec2, second: Vec2): Vec2 {
  const side = subtract(second, first);
  const denominator = side.x * side.x + side.y * side.y;
  if (denominator === 0) return first;
  const offset = subtract(vertex, first);
  const t = (offset.x * side.x + offset.y * side.y) / denominator;
  return { x: first.x + side.x * t, y: first.y + side.y * t };
}

function medianPoint(first: Vec2, second: Vec2): Vec2 {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

function bisectorPoint(vertex: Vec2, first: Vec2, second: Vec2): Vec2 {
  const firstLength = distance(vertex, first);
  const secondLength = distance(vertex, second);
  const total = firstLength + secondLength;
  if (total === 0) return medianPoint(first, second);
  return {
    x: (secondLength * first.x + firstLength * second.x) / total,
    y: (secondLength * first.y + firstLength * second.y) / total,
  };
}

function constructionPointName(kind: VertexConstructionKind): string {
  return kind === "altitude" ? "H" : kind === "median" ? "M" : "L";
}

export function createVertexConstructionCommand(input: {
  readonly document: BoardDocument;
  readonly kind: VertexConstructionKind;
  readonly metadata: CommandMetadata;
  readonly token: string;
  readonly vertexObjectId: BoardObjectId;
}): AddObjectsCommand | null {
  const context = inspectTextShapeVertex(input.document, input.vertexObjectId);
  if (context === null) return null;
  const vertices = vertexObjects(input.document, context.groupId);
  const source = vertices.find(
    ({ object }) => object.id === input.vertexObjectId,
  );
  const opposite = vertices.filter(
    ({ object }) => object.id !== input.vertexObjectId,
  );
  if (source === undefined || vertices.length !== 3 || opposite.length !== 2) {
    return null;
  }
  const [first, second] = opposite;
  const endpoint =
    input.kind === "altitude"
      ? altitudeFoot(
          source.object.position,
          first!.object.position,
          second!.object.position,
        )
      : input.kind === "median"
        ? medianPoint(first!.object.position, second!.object.position)
        : bisectorPoint(
            source.object.position,
            first!.object.position,
            second!.object.position,
          );
  const pointName = constructionPointName(input.kind);
  const prefix = `object:text-shape-construction:${input.token}:${input.kind}:${context.vertexName}`;
  const lineId = boardObjectId(`${prefix}:line`);
  const pointId = boardObjectId(`${prefix}:point:${pointName}`);
  const labelId = boardObjectId(`${prefix}:label:${pointName}`);
  const base = {
    groupId: context.groupId,
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
        end: subtract(endpoint, source.object.position),
        id: lineId,
        kind: "drawing.line",
        position: source.object.position,
        style: constructionStyle,
      },
      {
        ...base,
        id: pointId,
        kind: "drawing.ellipse",
        position: endpoint,
        radius: { x: 4, y: 4 },
        style: pointStyle,
      },
      {
        ...base,
        id: labelId,
        kind: "drawing.text",
        position: { x: endpoint.x + 8, y: endpoint.y - 10 },
        style: labelStyle,
        text: pointName,
        visible: context.labelsVisible,
      },
    ],
  };
}
