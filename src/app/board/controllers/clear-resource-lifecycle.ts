import { clearCoordinatePlotSamplingCache } from "../../../adapters/canvas-konva/public";
import { selectionToolId } from "../../../modules/selection/public";
import type { ActiveToolId } from "../active-tool";
import type { BoardDrawingController } from "./useBoardDrawingController";
import type { BoardEraserController } from "./useBoardEraserController";
import type { BoardGeometryController } from "./useBoardGeometryController";
import type { BoardHandwritingController } from "./useBoardHandwritingController";
import type { LaserPointerController } from "./useLaserPointerController";
import type { BoardSelectionController } from "./useBoardSelectionController";

/** Clear derived plot samples; the React renderer generation owns its GPU/media cleanup. */
export function releaseBoardPlotSamplingCache(): void {
  clearCoordinatePlotSamplingCache();
}

export interface BoardRenderResourceState {
  readonly documentId: string;
  readonly hasObjects: boolean;
}

/**
 * A complete removal of the final board object ends the current renderer
 * resource generation. The document and its Undo snapshots remain untouched.
 * The same transition also occurs when a collaborator clears the board.
 */
export function shouldResetBoardRenderResources(
  previous: BoardRenderResourceState,
  current: BoardRenderResourceState,
): boolean {
  return (
    previous.documentId === current.documentId &&
    previous.hasObjects &&
    !current.hasObjects
  );
}

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
