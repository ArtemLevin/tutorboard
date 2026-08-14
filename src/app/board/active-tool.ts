import { handwrittenFunctionToolId } from "../../modules/handwritten-function/public";
import type { DrawingToolId } from "../../modules/drawing/public";
import {
  selectionToolId,
  type SelectionToolId,
} from "../../modules/selection/public";

export const navigationToolId = "navigation.pan" as const;
export const laserToolId = "presentation.laser" as const;
export const geometryPlacementToolId = "geometry.text-placement" as const;

export type ActiveToolId =
  | typeof navigationToolId
  | typeof laserToolId
  | typeof geometryPlacementToolId
  | typeof handwrittenFunctionToolId
  | SelectionToolId
  | DrawingToolId;

export { handwrittenFunctionToolId, selectionToolId };
