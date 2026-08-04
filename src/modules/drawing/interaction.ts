import type {
  BoardObject,
  BoardObjectId,
  ObjectStyle,
  VectorInkSample,
  Vec2,
} from "../../core/public";

import {
  createVectorInkData,
  createVectorInkDataFromPoints,
} from "../../core/public";

import type { DrawingToolId } from "./tools";
import { simplifyStroke } from "./stroke-simplification";

const maximumPenPoints = 100_000;
const minimumGeometrySize = 0.001;
export const penStrokeStorageSimplificationTolerance = 0.1;

export type UserDrawingObject = BoardObject & {
  readonly source: { readonly kind: "user" };
};

interface InteractionBase {
  readonly objectId: BoardObjectId;
  readonly pointerId: number;
}

interface PenInteraction extends InteractionBase {
  readonly kind: "drawing-pen";
  readonly inputOriginMs: number | null;
  readonly samples: readonly VectorInkSample[];
  readonly style: ObjectStyle;
}

interface ShapeInteraction extends InteractionBase {
  readonly current: Vec2;
  readonly kind: "drawing-shape";
  readonly start: Vec2;
  readonly style: ObjectStyle;
  readonly polygonSides: number;
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
      readonly inputTimestampMs?: number;
      readonly point: Vec2;
      readonly pointerId: number;
      readonly polygonSides?: number;
      readonly pressure?: number;
      readonly style: ObjectStyle;
      readonly text: string;
      readonly tool: DrawingToolId;
    }
  | {
      readonly kind: "move";
      readonly inputTimestampMs?: number;
      readonly point: Vec2;
      readonly pointerId: number;
      readonly pressure?: number;
    }
  | {
      readonly kind: "finish";
      readonly inputTimestampMs?: number;
      readonly point: Vec2;
      readonly pointerId: number;
      readonly pressure?: number;
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

function normalizedPressure(value: number | undefined): number {
  return value === undefined || !Number.isFinite(value)
    ? 0.5
    : Math.min(1, Math.max(0, value));
}

function appendPenSample(
  state: Pick<PenInteraction, "inputOriginMs" | "samples">,
  action: {
    readonly inputTimestampMs?: number;
    readonly point: Vec2;
    readonly pressure?: number;
  },
): readonly VectorInkSample[] {
  const previous = state.samples.at(-1);
  if (
    state.samples.length >= maximumPenPoints ||
    (previous !== undefined && samePoint(previous.point, action.point))
  ) {
    return state.samples;
  }
  const timestampMs =
    state.inputOriginMs !== null &&
    action.inputTimestampMs !== undefined &&
    Number.isFinite(action.inputTimestampMs)
      ? Math.max(
          previous?.timestampMs ?? 0,
          action.inputTimestampMs - state.inputOriginMs,
        )
      : (previous?.timestampMs ?? -8) + 8;
  return [
    ...state.samples,
    {
      point: action.point,
      pressure: normalizedPressure(action.pressure),
      timestampMs: Math.max(0, timestampMs),
    },
  ];
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
  action: Extract<DrawingAction, { readonly kind: "finish" }>,
): UserDrawingObject | null {
  const appended = appendPenSample(state, action);
  const rawPoints = appended.map(({ point: samplePoint }) => samplePoint);
  const points = simplifyStroke(
    rawPoints,
    penStrokeStorageSimplificationTolerance,
  );
  const retained = new Set(points);
  const samples = appended.filter(({ point: samplePoint }) =>
    retained.has(samplePoint),
  );
  if (points.length < 2 || samples.length < 2) {
    return null;
  }

  return {
    ...userObjectBase(state.objectId, { x: 0, y: 0 }, state.style),
    ink: createVectorInkData(samples),
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
    case "drawing.polygon": {
      const radius = {
        x: Math.abs(delta.x) / 2,
        y: Math.abs(delta.y) / 2,
      };
      if (radius.x < minimumGeometrySize || radius.y < minimumGeometrySize) {
        return null;
      }
      const sides = Math.min(24, Math.max(3, Math.round(state.polygonSides)));
      const points = Array.from({ length: sides }, (_, index) => {
        const angle = -Math.PI / 2 + (index * Math.PI * 2) / sides;
        return {
          x: Math.cos(angle) * radius.x,
          y: Math.sin(angle) * radius.y,
        };
      });
      points.push(points[0]!);
      return {
        ...userObjectBase(
          state.objectId,
          {
            x: (state.start.x + point.x) / 2,
            y: (state.start.y + point.y) / 2,
          },
          state.style,
        ),
        ink: createVectorInkDataFromPoints(points),
        kind: "drawing.pen-stroke",
        points,
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
      return state.samples.length < 2
        ? null
        : {
            ...userObjectBase(state.objectId, { x: 0, y: 0 }, state.style),
            ink: createVectorInkData(state.samples),
            kind: "drawing.pen-stroke",
            points: state.samples.map(({ point }) => point),
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
        inputOriginMs:
          action.inputTimestampMs !== undefined &&
          Number.isFinite(action.inputTimestampMs)
            ? action.inputTimestampMs
            : null,
        samples: [
          {
            point: action.point,
            pressure: normalizedPressure(action.pressure),
            timestampMs: 0,
          },
        ],
        style: action.style,
      });
    case "drawing.line":
    case "drawing.rectangle":
    case "drawing.ellipse":
    case "drawing.polygon":
      return transition({
        current: action.point,
        kind: "drawing-shape",
        objectId: action.objectId,
        pointerId: action.pointerId,
        polygonSides: action.polygonSides ?? 5,
        start: action.point,
        style: action.style,
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
        style: action.style,
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
          samples: appendPenSample(state, action),
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
      completedObject = completePen(state, action);
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
