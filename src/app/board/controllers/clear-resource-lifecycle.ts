import { selectionToolId } from "../../../modules/selection/public";
import type { ActiveToolId } from "../active-tool";
import type { BoardDrawingController } from "./useBoardDrawingController";
import type { BoardEraserController } from "./useBoardEraserController";
import type { BoardGeometryController } from "./useBoardGeometryController";
import type { BoardHandwritingController } from "./useBoardHandwritingController";
import type { LaserPointerController } from "./useLaserPointerController";
import type { BoardSelectionController } from "./useBoardSelectionController";

export interface ClearBoardTransientStateDependencies {
  readonly drawing: Pick<
    BoardDrawingController,
    "cancel" | "resetSmartInkSession" | "setSmartInkNotice"
  >;
  readonly eraser: Pick<BoardEraserController, "clear">;
  readonly geometry: Pick<BoardGeometryController, "resetTransientState">;
  readonly handwriting: Pick<BoardHandwritingController, "resetSession">;
  readonly laser: Pick<LaserPointerController, "clear">;
  readonly onInspectorClose: () => void;
  readonly selection: Pick<
    BoardSelectionController,
    "cancel" | "replaceSelection"
  >;
  readonly setActiveTool: (tool: ActiveToolId) => void;
}

export function resetBoardTransientStateAfterClear({
  drawing,
  eraser,
  geometry,
  handwriting,
  laser,
  onInspectorClose,
  selection,
  setActiveTool,
}: ClearBoardTransientStateDependencies): void {
  drawing.cancel();
  eraser.clear();
  drawing.setSmartInkNotice(null);
  drawing.resetSmartInkSession();
  handwriting.resetSession();
  geometry.resetTransientState();
  laser.clear();
  selection.cancel();
  selection.replaceSelection([]);
  onInspectorClose();
  setActiveTool(selectionToolId);
}
