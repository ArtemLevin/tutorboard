import { useCallback } from "react";

import { isDrawingToolId } from "../../../modules/drawing/public";
import { eraserToolId } from "../../../modules/eraser/public";
import { handwrittenFunctionToolId } from "../../../modules/handwritten-function/public";
import {
  aggregateSelectionBounds,
  expandSelectionObjectIds,
  isSelectionToolId,
  lassoSelectionToolId,
  pointInSelectionBounds,
  selectTopObjectIdNearPoint,
  selectionToolId,
} from "../../../modules/selection/public";
import type {
  SelectionPointerStartSample,
  WorldModifierSample,
  WorldPointerSample,
} from "../../../adapters/canvas-konva/public";
import type { BoardSceneReadModel } from "../../../core/public";
import type { ActiveToolId } from "../active-tool";
import { geometryPlacementToolId, laserToolId } from "../active-tool";
import type { BoardDrawingController } from "./useBoardDrawingController";
import type { BoardEraserController } from "./useBoardEraserController";
import type { BoardDocumentController } from "./useBoardDocumentController";
import type { BoardGeometryController } from "./useBoardGeometryController";
import type { BoardHandwritingController } from "./useBoardHandwritingController";
import type { LaserPointerController } from "./useLaserPointerController";
import type { BoardSelectionController } from "./useBoardSelectionController";

export interface UseBoardInteractionRouterOptions {
  readonly activeTool: ActiveToolId;
  readonly documentController: BoardDocumentController;
  readonly drawing: BoardDrawingController;
  readonly eraser: BoardEraserController;
  readonly geometry: BoardGeometryController;
  readonly handwriting: BoardHandwritingController;
  readonly laser: LaserPointerController;
  readonly onInspectorClose: () => void;
  readonly scene: BoardSceneReadModel;
  readonly selection: BoardSelectionController;
  readonly setActiveTool: (tool: ActiveToolId) => void;
}

export function useBoardInteractionRouter({
  activeTool,
  documentController,
  drawing,
  eraser,
  geometry,
  handwriting,
  laser,
  onInspectorClose,
  scene,
  selection,
  setActiveTool,
}: UseBoardInteractionRouterOptions) {
  const activate = useCallback(
    (tool: ActiveToolId) => {
      if (
        activeTool === handwrittenFunctionToolId &&
        tool !== handwrittenFunctionToolId &&
        !handwriting.preserveInk()
      ) {
        return;
      }
      drawing.cancel();
      eraser.cancel();
      drawing.setSmartInkNotice(null);
      selection.cancel();
      onInspectorClose();
      if (tool !== "drawing.smart-ink") drawing.resetSmartInkSession();
      if (tool !== eraserToolId) eraser.clear();
      if (tool !== laserToolId) laser.clear();
      setActiveTool(tool);
    },
    [
      activeTool,
      drawing,
      eraser,
      handwriting,
      laser,
      onInspectorClose,
      selection,
      setActiveTool,
    ],
  );

  const start = useCallback(
    (sample: WorldPointerSample) => {
      if (activeTool === geometryPlacementToolId) {
        geometry.placeAt(sample.point);
        return;
      }
      if (activeTool === laserToolId) {
        laser.start(sample.point);
        return;
      }
      if (activeTool === handwrittenFunctionToolId) {
        handwriting.startStroke(sample);
        return;
      }
      if (activeTool === eraserToolId) {
        eraser.start(sample);
        return;
      }
      if (isDrawingToolId(activeTool)) drawing.start(activeTool, sample);
    },
    [activeTool, drawing, eraser, geometry, handwriting, laser],
  );

  const modifiersChange = useCallback(
    (sample: WorldModifierSample) => {
      if (isDrawingToolId(activeTool)) drawing.modifiersChange(sample);
    },
    [activeTool, drawing],
  );

  const move = useCallback(
    (sample: WorldPointerSample) => {
      if (activeTool === laserToolId) {
        laser.move(sample.point);
        return;
      }
      if (activeTool === handwrittenFunctionToolId) {
        handwriting.moveStroke(sample);
        return;
      }
      if (activeTool === eraserToolId) {
        eraser.move(sample);
        return;
      }
      if (isDrawingToolId(activeTool)) drawing.move(sample);
    },
    [activeTool, drawing, eraser, handwriting, laser],
  );

  const moveBatch = useCallback(
    (samples: readonly WorldPointerSample[]) => {
      if (samples.length === 0) return;
      if (activeTool === laserToolId) {
        laser.moveBatch(samples.map(({ point }) => point));
        return;
      }
      if (activeTool === handwrittenFunctionToolId) {
        handwriting.moveStrokeBatch(samples);
        return;
      }
      if (activeTool === eraserToolId) {
        eraser.moveBatch(samples);
        return;
      }
      if (isDrawingToolId(activeTool)) drawing.moveBatch(samples);
    },
    [activeTool, drawing, eraser, handwriting, laser],
  );

  const finish = useCallback(
    (sample: WorldPointerSample) => {
      if (activeTool === laserToolId) {
        laser.finish(sample.point);
        return;
      }
      if (activeTool === handwrittenFunctionToolId) {
        handwriting.finishStroke(sample);
        return;
      }
      if (activeTool === eraserToolId) {
        eraser.finish(sample);
        return;
      }
      if (activeTool === "drawing.text") return;
      if (isDrawingToolId(activeTool)) drawing.finish(activeTool, sample);
    },
    [activeTool, drawing, eraser, handwriting, laser],
  );

  const cancel = useCallback(
    (pointerId: number) => {
      if (activeTool === laserToolId) {
        laser.clear();
        return;
      }
      if (activeTool === handwrittenFunctionToolId) {
        handwriting.cancelStroke(pointerId);
        return;
      }
      if (activeTool === eraserToolId) {
        eraser.cancel(pointerId);
        return;
      }
      if (isDrawingToolId(activeTool)) drawing.cancel(pointerId);
    },
    [activeTool, drawing, eraser, handwriting, laser],
  );

  const selectionStart = useCallback(
    (sample: SelectionPointerStartSample): boolean => {
      if (geometry.tryAddContourPoint(sample)) return true;
      const vertex = geometry.inspectVertexNear(sample, scene);
      const proximityObjectId =
        sample.areaOnly === true || sample.objectId !== null
          ? null
          : selectTopObjectIdNearPoint(
              scene,
              sample.point,
              sample.hitToleranceWorld ?? 0,
            );
      const effectiveObjectId =
        sample.objectId ?? vertex?.vertexObjectId ?? proximityObjectId;
      if (effectiveObjectId !== null && !isSelectionToolId(activeTool)) {
        activate(selectionToolId);
      }
      const aggregateBounds =
        sample.areaOnly === true
          ? null
          : aggregateSelectionBounds(
              selection.bounds,
              sample.hitToleranceWorld ?? 0,
            );
      const hitObjectIds =
        effectiveObjectId !== null
          ? expandSelectionObjectIds(documentController.getDocument(), [
              effectiveObjectId,
            ])
          : aggregateBounds !== null &&
              pointInSelectionBounds(sample.point, aggregateBounds)
            ? selection.getState().selectedObjectIds
            : [];
      selection.start({
        additive: sample.additive,
        areaKind: activeTool === lassoSelectionToolId ? "lasso" : "marquee",
        areaOperation:
          sample.areaOperation ?? (sample.additive ? "add" : "replace"),
        hitObjectIds,
        point: sample.point,
        pointerId: sample.pointerId,
      });
      return hitObjectIds.length > 0;
    },
    [activeTool, activate, documentController, geometry, scene, selection],
  );

  const selectionMove = useCallback(
    (sample: WorldPointerSample) => selection.move(sample),
    [selection],
  );

  const selectionFinish = useCallback(
    (sample: WorldPointerSample) => {
      if (geometry.consumeContourPointer(sample.pointerId)) return;
      selection.finish(sample);
    },
    [geometry, selection],
  );

  const selectionCancel = useCallback(
    (pointerId: number) => {
      if (geometry.consumeContourPointer(pointerId)) return;
      selection.cancel(pointerId);
    },
    [geometry, selection],
  );

  return {
    activate,
    cancel,
    finish,
    modifiersChange,
    move,
    moveBatch,
    selectionCancel,
    selectionFinish,
    selectionMove,
    selectionStart,
    start,
  } as const;
}

export type BoardInteractionRouter = ReturnType<
  typeof useBoardInteractionRouter
>;
