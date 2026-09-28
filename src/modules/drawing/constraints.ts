import type { Vec2 } from "../../core/public";
import type { InputModifiers } from "../../shared/input-modifiers";
import type { DrawingToolId } from "./tools";

export type ConstrainedDrawingToolId = Exclude<
  DrawingToolId,
  "drawing.pen" | "drawing.smart-ink" | "drawing.text"
>;

export type DrawingConstraintFeedback =
  | {
      readonly angleDegrees: number;
      readonly kind: "angle";
    }
  | { readonly kind: "square" }
  | { readonly kind: "circle" }
  | { readonly kind: "regular-polygon" }
  | null;

export interface DrawingConstraintResult {
  readonly feedback: DrawingConstraintFeedback;
  readonly point: Vec2;
}

const angleStepDegrees = 15;
const angleHysteresisDegrees = 2;

function degrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

function radians(degreesValue: number): number {
  return (degreesValue * Math.PI) / 180;
}

function normalizeAngleDegrees(value: number): number {
  let normalized = value % 360;
  if (normalized <= -180) normalized += 360;
  if (normalized > 180) normalized -= 360;
  return normalized;
}

function angularDistanceDegrees(left: number, right: number): number {
  return Math.abs(normalizeAngleDegrees(left - right));
}

function constrainedSquarePoint(start: Vec2, current: Vec2): Vec2 {
  const dx = current.x - start.x;
  const dy = current.y - start.y;
  const side = Math.max(Math.abs(dx), Math.abs(dy));
  return {
    x: start.x + Math.sign(dx || 1) * side,
    y: start.y + Math.sign(dy || 1) * side,
  };
}

export function resolveDrawingConstraint(
  tool: ConstrainedDrawingToolId,
  start: Vec2,
  current: Vec2,
  modifiers: InputModifiers,
  previousFeedback: DrawingConstraintFeedback = null,
): DrawingConstraintResult {
  if (!modifiers.shift) {
    return { feedback: null, point: current };
  }

  if (tool === "drawing.line") {
    const dx = current.x - start.x;
    const dy = current.y - start.y;
    const distance = Math.hypot(dx, dy);
    if (distance === 0) {
      return {
        feedback: { angleDegrees: 0, kind: "angle" },
        point: current,
      };
    }

    const rawAngle = degrees(Math.atan2(dy, dx));
    const nearest = Math.round(rawAngle / angleStepDegrees) * angleStepDegrees;
    const previousAngle =
      previousFeedback?.kind === "angle"
        ? previousFeedback.angleDegrees
        : null;
    const snappedAngle =
      previousAngle !== null &&
      angularDistanceDegrees(rawAngle, previousAngle) <=
        angleStepDegrees / 2 + angleHysteresisDegrees
        ? previousAngle
        : nearest;
    const angle = radians(snappedAngle);
    return {
      feedback: {
        angleDegrees: normalizeAngleDegrees(snappedAngle),
        kind: "angle",
      },
      point: {
        x: start.x + Math.cos(angle) * distance,
        y: start.y + Math.sin(angle) * distance,
      },
    };
  }

  const point = constrainedSquarePoint(start, current);
  if (tool === "drawing.rectangle") {
    return { feedback: { kind: "square" }, point };
  }
  if (tool === "drawing.ellipse") {
    return { feedback: { kind: "circle" }, point };
  }
  return { feedback: { kind: "regular-polygon" }, point };
}
