import { useCallback } from "react";

import { isDrawingToolId } from "../../../modules/drawing/public";
import { handwrittenFunctionToolId } from "../../../modules/handwritten-function/public";
import {
  expandSelectionObjectIds,
  isSelectionToolId,
  lassoSelectionToolId,
  selectionToolId,
} from "../../../modules/selection/public";
import type {
  SelectionPointerStartSample,
  WorldPointerSample,
} from "../../../adapters/canvas-konva/public";
import type { BoardSceneReadModel } from "../../../core/public";
import type { ActiveToolId } from "../active-tool";
import { geometryPlacementToolId, laserToolId } from "../active-tool";
import type { BoardDrawingController } from "./useBoardDrawingController";
import type { BoardDocumentController } from "./useBoardDocumentController";
import type { BoardGeometryController } from "./useBoardGeometryController";
import type { BoardHandwritingController } from "./useBoardHandwritingController";
import type { LaserPointerController } from "./useLaserPointerController";
import type { BoardSelectionController } from "./useBoardSelectionController";

export interface UseBoardInteractionRouterOptions {
  readonly activeTool: ActiveToolId;
  readonly documentController: BoardDocumentController;
  readonly drawing: BoardDrawingController;
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
      drawing.setSmartInkNotice(null);
      selection.cancel();
      onInspectorClose();
      if (tool !== "drawing.smart-ink") drawing.resetSmartInkSession();
      if (tool !== laserToolId) laser.clear();
      setActiveTool(tool);
    },
    [
      activeTool,
      drawing,
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
      if (isDrawingToolId(activeTool)) drawing.start(activeTool, sample);
    },
    [activeTool, drawing, geometry, handwriting, laser],
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
      if (isDrawingToolId(activeTool)) drawing.move(sample);
    },
    [activeTool, drawing, handwriting, laser],
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
      if (isDrawingToolId(activeTool)) drawing.moveBatch(samples);
    },
    [activeTool, drawing, handwriting, laser],
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
      if (isDrawingToolId(activeTool)) drawing.finish(activeTool, sample);
    },
    [activeTool, drawing, handwriting, laser],
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
      if (isDrawingToolId(activeTool)) drawing.cancel(pointerId);
    },
    [activeTool, drawing, handwriting, laser],
  );

  const selectionStart = useCallback(
    (sample: SelectionPointerStartSample) => {
      if (geometry.tryAddContourPoint(sample)) return;
      const vertex = geometry.inspectVertexNear(sample, scene);
      const effectiveObjectId =
        sample.objectId ?? vertex?.vertexObjectId ?? null;
      if (effectiveObjectId !== null && !isSelectionToolId(activeTool)) {
        activate(selectionToolId);
      }
      const hitObjectIds =
        effectiveObjectId === null
          ? []
          : expandSelectionObjectIds(documentController.getDocument(), [
              effectiveObjectId,
            ]);
      selection.start({
        additive: sample.additive,
        areaKind: activeTool === lassoSelectionToolId ? "lasso" : "marquee",
        areaOperation:
          sample.areaOperation ?? (sample.additive ? "add" : "replace"),
        hitObjectIds,
        point: sample.point,
        pointerId: sample.pointerId,
      });
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
