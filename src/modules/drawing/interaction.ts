import type {
  BoardObject,
  BoardObjectId,
  ObjectStyle,
  Vec2,
} from "../../core/public";

import { drawingStyleDefaults, type DrawingToolId } from "./tools";
import { simplifyStroke } from "./stroke-simplification";

const maximumPenPoints = 100_000;
const minimumGeometrySize = 0.001;

export type UserDrawingObject = BoardObject & {
  readonly source: { readonly kind: "user" };
};

interface InteractionBase {
  readonly objectId: BoardObjectId;
  readonly pointerId: number;
}

interface PenInteraction extends InteractionBase {
  readonly kind: "drawing-pen";
  readonly points: readonly Vec2[];
  readonly style: ObjectStyle;
}

interface ShapeInteraction extends InteractionBase {
  readonly current: Vec2;
  readonly kind: "drawing-shape";
  readonly start: Vec2;
  readonly style: ObjectStyle;
  readonly tool: Exclude<
    DrawingToolId,
    "drawing.pen" | "drawing.smart-ink" | "drawing.text"
  >;
}

interface TextInteraction extends InteractionBase {
  readonly kind: "placing-text";
  readonly position: Vec2;
  readonly style: ObjectStyle;
  readonly text: string;
}

export type DrawingInteractionState =
  | { readonly kind: "idle" }
  | PenInteraction
  | ShapeInteraction
  | TextInteraction;

export type DrawingDiagnosticCode =
  "drawing.empty-geometry" | "drawing.empty-text" | "drawing.invalid-input";

export type DrawingAction =
  | {
      readonly kind: "start";
      readonly objectId: BoardObjectId;
      readonly point: Vec2;
      readonly pointerId: number;
      readonly text: string;
      readonly tool: DrawingToolId;
    }
  | {
      readonly kind: "move";
      readonly point: Vec2;
      readonly pointerId: number;
    }
  | {
      readonly kind: "finish";
      readonly point: Vec2;
      readonly pointerId: number;
    }
  | {
      readonly kind: "cancel";
      readonly pointerId?: number;
    };

export interface DrawingTransition {
  readonly completedObject: UserDrawingObject | null;
  readonly diagnostic: DrawingDiagnosticCode | null;
  readonly state: DrawingInteractionState;
}

const idle: DrawingInteractionState = { kind: "idle" };

function transition(
  state: DrawingInteractionState,
  completedObject: UserDrawingObject | null = null,
  diagnostic: DrawingDiagnosticCode | null = null,
): DrawingTransition {
  return { state, completedObject, diagnostic };
}

function isFinitePoint(point: Vec2): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function isValidPointerId(pointerId: number): boolean {
  return Number.isInteger(pointerId) && pointerId >= 0;
}

function samePoint(left: Vec2, right: Vec2): boolean {
  return left.x === right.x && left.y === right.y;
}

function appendPenPoint(points: readonly Vec2[], point: Vec2): readonly Vec2[] {
  const previous = points.at(-1);
  if (
    points.length >= maximumPenPoints ||
    (previous !== undefined && samePoint(previous, point))
  ) {
    return points;
  }

  return [...points, point];
}

function userObjectBase(id: BoardObjectId, position: Vec2, style: ObjectStyle) {
  return {
    groupId: null,
    id,
    locked: false,
    position,
    rotation: 0,
    scale: { x: 1, y: 1 },
    source: { kind: "user" as const },
    style,
    visible: true,
  };
}

function completePen(
  state: PenInteraction,
  point: Vec2,
): UserDrawingObject | null {
  const points = simplifyStroke(appendPenPoint(state.points, point));
  if (points.length < 2) {
    return null;
  }

  return {
    ...userObjectBase(state.objectId, { x: 0, y: 0 }, state.style),
    kind: "drawing.pen-stroke",
    points,
  };
}

function completeShape(
  state: ShapeInteraction,
  point: Vec2,
): UserDrawingObject | null {
  const delta = {
    x: point.x - state.start.x,
    y: point.y - state.start.y,
  };

  if (
    Math.abs(delta.x) < minimumGeometrySize &&
    Math.abs(delta.y) < minimumGeometrySize
  ) {
    return null;
  }

  switch (state.tool) {
    case "drawing.line":
      return {
        ...userObjectBase(state.objectId, state.start, state.style),
        end: delta,
        kind: "drawing.line",
      };
    case "drawing.rectangle": {
      const width = Math.abs(delta.x);
      const height = Math.abs(delta.y);
      if (width < minimumGeometrySize || height < minimumGeometrySize) {
        return null;
      }

      return {
        ...userObjectBase(
          state.objectId,
          {
            x: Math.min(state.start.x, point.x),
            y: Math.min(state.start.y, point.y),
          },
          state.style,
        ),
        kind: "drawing.rectangle",
        size: { height, width },
      };
    }
    case "drawing.ellipse": {
      const radius = {
        x: Math.abs(delta.x) / 2,
        y: Math.abs(delta.y) / 2,
      };
      if (radius.x < minimumGeometrySize || radius.y < minimumGeometrySize) {
        return null;
      }

      return {
        ...userObjectBase(
          state.objectId,
          {
            x: (state.start.x + point.x) / 2,
            y: (state.start.y + point.y) / 2,
          },
          state.style,
        ),
        kind: "drawing.ellipse",
        radius,
      };
    }
  }
}

function previewShape(state: ShapeInteraction): UserDrawingObject | null {
  return completeShape(state, state.current);
}

export function getDrawingPreview(
  state: DrawingInteractionState,
): UserDrawingObject | null {
  switch (state.kind) {
    case "idle":
      return null;
    case "drawing-pen":
      return state.points.length < 2
        ? null
        : {
            ...userObjectBase(state.objectId, { x: 0, y: 0 }, state.style),
            kind: "drawing.pen-stroke",
            points: state.points,
          };
    case "drawing-shape":
      return previewShape(state);
    case "placing-text":
      return {
        ...userObjectBase(state.objectId, state.position, state.style),
        kind: "drawing.text",
        text: state.text,
      };
  }
}

function startInteraction(
  action: Extract<DrawingAction, { readonly kind: "start" }>,
): DrawingTransition {
  if (!isFinitePoint(action.point) || !isValidPointerId(action.pointerId)) {
    return transition(idle, null, "drawing.invalid-input");
  }

  switch (action.tool) {
    case "drawing.pen":
    case "drawing.smart-ink":
      return transition({
        kind: "drawing-pen",
        objectId: action.objectId,
        pointerId: action.pointerId,
        points: [action.point],
        style:
          action.tool === "drawing.smart-ink"
            ? drawingStyleDefaults.smartInk
            : drawingStyleDefaults.pen,
      });
    case "drawing.line":
    case "drawing.rectangle":
    case "drawing.ellipse":
      return transition({
        current: action.point,
        kind: "drawing-shape",
        objectId: action.objectId,
        pointerId: action.pointerId,
        start: action.point,
        style:
          action.tool === "drawing.line"
            ? drawingStyleDefaults.line
            : action.tool === "drawing.rectangle"
              ? drawingStyleDefaults.rectangle
              : drawingStyleDefaults.ellipse,
        tool: action.tool,
      });
    case "drawing.text": {
      const text = action.text.trim();
      if (text.length === 0) {
        return transition(idle, null, "drawing.empty-text");
      }
      return transition({
        kind: "placing-text",
        objectId: action.objectId,
        pointerId: action.pointerId,
        position: action.point,
        style: drawingStyleDefaults.text,
        text,
      });
    }
  }
}

export function reduceDrawingInteraction(
  state: DrawingInteractionState,
  action: DrawingAction,
): DrawingTransition {
  if (action.kind === "cancel") {
    if (
      state.kind === "idle" ||
      (action.pointerId !== undefined && action.pointerId !== state.pointerId)
    ) {
      return transition(state);
    }
    return transition(idle);
  }

  if (action.kind === "start") {
    return state.kind === "idle" ? startInteraction(action) : transition(state);
  }

  if (
    state.kind === "idle" ||
    state.pointerId !== action.pointerId ||
    !isFinitePoint(action.point)
  ) {
    return transition(
      state,
      null,
      !isFinitePoint(action.point) ? "drawing.invalid-input" : null,
    );
  }

  if (action.kind === "move") {
    switch (state.kind) {
      case "drawing-pen":
        return transition({
          ...state,
          points: appendPenPoint(state.points, action.point),
        });
      case "drawing-shape":
        return transition({ ...state, current: action.point });
      case "placing-text":
        return transition({ ...state, position: action.point });
    }
  }

  let completedObject: UserDrawingObject | null;
  switch (state.kind) {
    case "drawing-pen":
      completedObject = completePen(state, action.point);
      break;
    case "drawing-shape":
      completedObject = completeShape(state, action.point);
      break;
    case "placing-text":
      completedObject = {
        ...userObjectBase(state.objectId, action.point, state.style),
        kind: "drawing.text",
        text: state.text,
      };
      break;
  }

  return transition(
    idle,
    completedObject,
    completedObject === null ? "drawing.empty-geometry" : null,
  );
}
