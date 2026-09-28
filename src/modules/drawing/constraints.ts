import type { Vec2 } from "../../core/public";
import type { InputModifiers } from "../../shared/input-modifiers";
import type { DrawingToolId } from "./tools";

export const drawingAngleSnapDegrees = 15;

export interface DrawingConstraintFeedback {
  readonly angleDegrees?: number;
  readonly kind: "angle" | "circle" | "regular-polygon" | "square";
  readonly label: string;
}

export interface ResolvedDrawingConstraint {
  readonly feedback: DrawingConstraintFeedback | null;
  readonly point: Vec2;
}

function normalizeDegrees(value: number): number {
  let normalized = value % 360;
  if (normalized > 180) normalized -= 360;
  if (normalized <= -180) normalized += 360;
  const rounded = Math.round(normalized * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function constrainLine(start: Vec2, current: Vec2): ResolvedDrawingConstraint {
  const dx = current.x - start.x;
  const dy = current.y - start.y;
  const distance = Math.hypot(dx, dy);
  if (distance === 0) return { feedback: null, point: current };

  const angle = Math.atan2(dy, dx);
  const step = (drawingAngleSnapDegrees * Math.PI) / 180;
  const snappedAngle = Math.round(angle / step) * step;
  const angleDegrees = normalizeDegrees((snappedAngle * 180) / Math.PI);
  return {
    feedback: {
      angleDegrees,
      kind: "angle",
      label: `${angleDegrees}°`,
    },
    point: {
      x: start.x + Math.cos(snappedAngle) * distance,
      y: start.y + Math.sin(snappedAngle) * distance,
    },
  };
}

function constrainSquareLike(
  start: Vec2,
  current: Vec2,
  kind: "circle" | "regular-polygon" | "square",
): ResolvedDrawingConstraint {
  const dx = current.x - start.x;
  const dy = current.y - start.y;
  const side = Math.max(Math.abs(dx), Math.abs(dy));
  return {
    feedback: {
      kind,
      label:
        kind === "square"
          ? "⇧ квадрат"
          : kind === "circle"
            ? "⇧ окружность"
            : "⇧ правильный многоугольник",
    },
    point: {
      x: start.x + Math.sign(dx || 1) * side,
      y: start.y + Math.sign(dy || 1) * side,
    },
  };
}

export function resolveDrawingConstraint(input: {
  readonly current: Vec2;
  readonly modifiers: InputModifiers;
  readonly start: Vec2;
  readonly tool: DrawingToolId;
}): ResolvedDrawingConstraint {
  if (!input.modifiers.shift) {
    return { feedback: null, point: input.current };
  }

  switch (input.tool) {
    case "drawing.line":
      return constrainLine(input.start, input.current);
    case "drawing.rectangle":
      return constrainSquareLike(
        input.start,
        input.current,
        "square",
      );
    case "drawing.ellipse":
      return constrainSquareLike(
        input.start,
        input.current,
        "circle",
      );
    case "drawing.polygon":
      return constrainSquareLike(
        input.start,
        input.current,
        "regular-polygon",
      );
    case "drawing.pen":
    case "drawing.smart-ink":
    case "drawing.text":
      return { feedback: null, point: input.current };
  }
}
