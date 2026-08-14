import { lazy, Suspense, type RefObject } from "react";

import { handwrittenFunctionToolId } from "../../../modules/handwritten-function/public";
import { CoordinatePlotEditorPanel } from "../../CoordinatePlotEditorPanel";
import { CoordinatePlotNavigationControls } from "../../CoordinatePlotNavigationControls";
import { GeometryPromptPanel } from "../../GeometryPromptPanel";
import { HandwrittenFunctionPanel } from "../../HandwrittenFunctionPanel";
import type { ActiveToolId } from "../active-tool";
import { navigationToolId } from "../active-tool";
import type { BoardGeometryController } from "../controllers/useBoardGeometryController";
import type { BoardHandwritingController } from "../controllers/useBoardHandwritingController";
import type { BoardInteractionRouter } from "../controllers/useBoardInteractionRouter";
import type { BoardSolid3DController } from "../controllers/useBoardSolid3DController";
import type { CoordinatePlotController } from "../controllers/useCoordinatePlotController";

const LazySolid3DEditorPanel = lazy(() =>
  import("../../solid-3d/Solid3DEditorPanel").then((module) => ({
    default: module.Solid3DEditorPanel,
  })),
);

export interface BoardOverlaysProps {
  readonly activeTool: ActiveToolId;
  readonly geometry: BoardGeometryController;
  readonly handwriting: BoardHandwritingController;
  readonly handwrittenFunctionsEnabled: boolean;
  readonly interaction: BoardInteractionRouter;
  readonly plots: CoordinatePlotController;
  readonly readOnly: boolean;
  readonly solid3D: BoardSolid3DController;
  readonly solid3DLearningEnabled: boolean;
  readonly undo: () => void;
  readonly workspaceRef: RefObject<HTMLElement | null>;
}

export function BoardOverlays({
  activeTool,
  geometry,
  handwriting,
  handwrittenFunctionsEnabled,
  interaction,
  plots,
  readOnly,
  solid3D,
  solid3DLearningEnabled,
  undo,
  workspaceRef,
}: BoardOverlaysProps) {
  const editor = plots.editor;
  const handwrittenFunctionPanelOpen =
    handwrittenFunctionsEnabled &&
    (activeTool === handwrittenFunctionToolId ||
      handwriting.state.kind !== "idle");

  return (
    <>
      {editor === null ? null : (
        <>
          <CoordinatePlotNavigationControls
            axis={editor.zoomAxis}
            onAxisChange={plots.setZoomAxis}
            onFit={plots.fitViewport}
            onReset={plots.resetViewport}
            onZoomIn={() => plots.zoom(1 / 1.25)}
            onZoomOut={() => plots.zoom(1.25)}
          />
          <CoordinatePlotEditorPanel
            definition={editor.draft}
            fallbackFocusRef={workspaceRef}
            key={editor.objectId}
            dirty={editor.draft !== editor.expected}
            issues={plots.issues}
            onAddParameter={plots.addParameter}
            onAddSeries={plots.addSeries}
            onClose={plots.close}
            onDefinitionChange={plots.updateDraft}
            onSave={plots.save}
            onSelectedSeriesChange={(seriesId) =>
              plots.selectSeries(editor.objectId, seriesId)
            }
            readOnly={readOnly}
            selectedSeriesId={editor.selectedSeriesId}
          />
        </>
      )}
      {solid3D.record === null ? null : (
        <Suspense
          fallback={
            <div className="board-toast is-info" role="status">
              Загрузка 3D-редактора…
            </div>
          }
        >
          <LazySolid3DEditorPanel
            learningAttempt={solid3D.learningAttempt}
            learningAttempts={solid3D.learningAttempts}
            learningEnabled={solid3DLearningEnabled}
            onClose={solid3D.close}
            onProject={solid3D.project}
            onRecordChange={solid3D.updateRecord}
            onLearningStart={solid3D.startLearning}
            onLearningAction={solid3D.learningAction}
            onLearningReset={solid3D.resetLearning}
            onLearningComplete={solid3D.completeLearning}
            onUndo={undo}
            readOnly={readOnly}
            record={solid3D.record}
          />
        </Suspense>
      )}
      {handwrittenFunctionPanelOpen ? (
        <HandwrittenFunctionPanel
          canBuild={handwriting.canBuild}
          canRecognize={handwriting.canRecognize}
          diagnostic={handwriting.diagnostic}
          draftCandidate={handwriting.draftCandidate}
          draftExpression={handwriting.draft}
          draftIssue={handwriting.draftIssue}
          interpretation={handwriting.interpretation}
          onBuild={handwriting.buildPlot}
          onCandidateSelect={handwriting.setDraft}
          onClear={handwriting.clear}
          onDraftChange={handwriting.setDraft}
          onKeepInk={() => interaction.activate(navigationToolId)}
          onRecognize={handwriting.recognize}
          recognizerAvailable={handwriting.recognizerAvailable}
          session={handwriting.state}
          sourcePersisted={handwriting.sourcePersisted}
        />
      ) : null}
      {geometry.open ? (
        <GeometryPromptPanel
          autoLabelVertices={geometry.autoLabelVertices}
          onCancel={geometry.cancelOperation}
          onAutoLabelVerticesChange={geometry.setAutoLabelVertices}
          onChooseClarification={geometry.chooseClarification}
          onPromptChange={geometry.changePrompt}
          onRetry={geometry.retry}
          onSubmit={geometry.armPlacement}
          onSuggestionChoose={geometry.chooseSuggestion}
          prompt={geometry.prompt}
          remoteAvailable={geometry.remoteAvailable}
          state={geometry.state}
          suggestions={geometry.suggestions}
        />
      ) : null}
    </>
  );
}
