import { drawingTools, isDrawingToolId } from "../../../modules/drawing/public";
import { isEditableTextObject } from "../../../modules/text-editing/public";
import { BoardToolDock } from "../../board-chrome/BoardToolDock";
import type { ActiveToolId } from "../active-tool";
import type { BoardDocumentController } from "../controllers/useBoardDocumentController";
import type { BoardDrawingController } from "../controllers/useBoardDrawingController";
import type { BoardGeometryController } from "../controllers/useBoardGeometryController";
import type { BoardInteractionRouter } from "../controllers/useBoardInteractionRouter";
import type { BoardMediaController } from "../controllers/useBoardMediaController";
import type { BoardSelectionController } from "../controllers/useBoardSelectionController";
import type { BoardSolid3DController } from "../controllers/useBoardSolid3DController";

export interface BoardToolDockContainerProps {
  readonly activeTool: ActiveToolId;
  readonly collaborativeUndoAvailable: boolean;
  readonly documentController: BoardDocumentController;
  readonly drawing: BoardDrawingController;
  readonly geometry: BoardGeometryController;
  readonly handwrittenFunctionsEnabled: boolean;
  readonly historyEnabled: boolean;
  readonly interaction: BoardInteractionRouter;
  readonly media: BoardMediaController;
  readonly onCreatePlot: () => void;
  readonly onExportPdfSnapshot?: (() => void) | undefined;
  readonly onExportPngSnapshot?: (() => void) | undefined;
  readonly onExportSvgSnapshot?: (() => void) | undefined;
  readonly onOpenSettings: () => void;
  readonly plotEditorOpen: boolean;
  readonly readOnly: boolean;
  readonly selection: BoardSelectionController;
  readonly selectionInspectorOpen: boolean;
  readonly settingsOpen: boolean;
  readonly solid3D: BoardSolid3DController;
}

export function BoardToolDockContainer({
  activeTool,
  collaborativeUndoAvailable,
  documentController,
  drawing,
  geometry,
  handwrittenFunctionsEnabled,
  historyEnabled,
  interaction,
  media,
  onCreatePlot,
  onExportPdfSnapshot,
  onExportPngSnapshot,
  onExportSvgSnapshot,
  onOpenSettings,
  plotEditorOpen,
  readOnly,
  selection,
  selectionInspectorOpen,
  settingsOpen,
  solid3D,
}: BoardToolDockContainerProps) {
  const { history, redo, undo } = documentController;
  const selectedEditableText = selection.selectedEditableText;
  return (
    <BoardToolDock
      activeStyle={
        isDrawingToolId(activeTool) ? drawing.styleFor(activeTool) : null
      }
      activeTool={activeTool}
      canRedo={historyEnabled && history.future.length > 0}
      canUndo={
        historyEnabled ? history.past.length > 0 : collaborativeUndoAvailable
      }
      drawingTools={drawingTools}
      generatedFigureLabelsVisible={
        geometry.selectedFigure?.labelsVisible ?? null
      }
      geometryAvailable
      geometryOpen={geometry.open}
      handwrittenFunctionsEnabled={handwrittenFunctionsEnabled}
      imageAccept={media.accept}
      onActivate={(tool) => interaction.activate(tool as ActiveToolId)}
      onCreatePlot={onCreatePlot}
      onExportPdfSnapshot={onExportPdfSnapshot}
      onExportPngSnapshot={onExportPngSnapshot}
      onExportSvgSnapshot={onExportSvgSnapshot}
      onDeleteSelection={selection.remove}
      canOpenSolid3D={solid3D.selectedRecord !== null}
      onOpenSolid3D={solid3D.openSelected}
      onGeometryToggle={() => geometry.setOpen(!geometry.open)}
      onGeneratedFigureLabelsChange={geometry.setLabelsVisible}
      onGeneratedFigureLabelsMove={geometry.moveLabels}
      onImageFiles={(files) => void media.importFiles(files)}
      onOpenSettings={onOpenSettings}
      onRedo={redo}
      canTransformSelection={
        (!plotEditorOpen && selection.transformableObjectIds.length > 0) ||
        geometry.selectedFigure !== null
      }
      onSelectionLockChange={selection.setLocked}
      onSelectionStyleChange={selection.updateStyle}
      onSelectedTextCommit={(text) => {
        if (isEditableTextObject(selectedEditableText)) {
          selection.updateText(selectedEditableText.id, text);
        }
      }}
      onTransformSelection={selection.transformBy}
      onVertexConstruction={geometry.buildVertexConstruction}
      onStyleChange={drawing.updateStyle}
      onTextDraftChange={drawing.setTextDraft}
      onUndo={undo}
      readOnly={readOnly}
      selectedCount={selection.state.selectedObjectIds.length}
      selectedLocked={selection.selectedLocked}
      selectedStyle={selection.selectedStyle}
      selectedText={
        isEditableTextObject(selectedEditableText)
          ? selectedEditableText.text
          : null
      }
      selectedVertexName={geometry.selectedVertex?.vertexName ?? null}
      selectionInspectorOpen={selectionInspectorOpen}
      settingsOpen={settingsOpen}
      textDraft={drawing.textDraft}
      vertexConstructions={
        geometry.selectedVertex?.availableConstructions ?? []
      }
    />
  );
}
