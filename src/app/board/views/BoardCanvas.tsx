import { useEffect, useMemo, useState } from "react";

import {
  BoardStage,
  clearCoordinatePlotSamplingCache,
  createDefaultKonvaRendererRegistry,
  type BoardObjectTransformSnapshot,
  type CanvasContextMenuRequest,
} from "../../../adapters/canvas-konva/public";
import {
  boardObjectId,
  type BoardDocument,
  type BoardObjectId,
  type BoardRenderItem,
  type BoardSceneReadModel,
  type Vec2,
  type ViewportState,
} from "../../../core/public";
import {
  drawingStyleDefaults,
  isDrawingToolId,
} from "../../../modules/drawing/public";
import { handwrittenFunctionToolId } from "../../../modules/handwritten-function/public";
import {
  isSelectionToolId,
  selectionToolId,
  selectTopObjectIdNearPoint,
} from "../../../modules/selection/public";
import {
  CanvasContextMenu,
  ClearCanvasDialog,
} from "../../board-chrome/CanvasContextMenu";
import type { ActiveToolId } from "../active-tool";
import {
  eraserToolId,
  geometryPlacementToolId,
  laserToolId,
  navigationToolId,
} from "../active-tool";
import type { BoardClipboardController } from "../controllers/useBoardClipboardController";
import type { BoardDrawingController } from "../controllers/useBoardDrawingController";
import type { BoardEraserController } from "../controllers/useBoardEraserController";
import type { BoardHandwritingController } from "../controllers/useBoardHandwritingController";
import type { BoardInteractionRouter } from "../controllers/useBoardInteractionRouter";
import type { LaserPointerController } from "../controllers/useLaserPointerController";
import type { BoardSelectionController } from "../controllers/useBoardSelectionController";
import type { BoardSolid3DController } from "../controllers/useBoardSolid3DController";
import type { CoordinatePlotController } from "../controllers/useCoordinatePlotController";
import { useTextEditorKeyboardSession } from "../text-editor-keyboard";

function InlineTextPlacementEditor({
  onCancel,
  onChange,
  onCommit,
  screenPoint,
  value,
}: {
  readonly onCancel: () => void;
  readonly onChange: (value: string) => void;
  readonly onCommit: () => void;
  readonly screenPoint: Vec2;
  readonly value: string;
}) {
  const keyboard = useTextEditorKeyboardSession({
    onCancel: () => onCancel(),
    onCommit: () => onCommit(),
  });

  return (
    <textarea
      aria-label="Редактор текста на доске"
      autoFocus
      className="board-inline-text-editor"
      data-testid="board-inline-text-editor"
      maxLength={100_000}
      onBlur={keyboard.onBlur}
      onChange={(event) => onChange(event.currentTarget.value)}
      onCompositionEnd={keyboard.onCompositionEnd}
      onCompositionStart={keyboard.onCompositionStart}
      onFocus={(event) => {
        keyboard.onFocus();
        event.currentTarget.select();
      }}
      onKeyDown={keyboard.onKeyDown}
      rows={2}
      style={{
        left: screenPoint.x,
        top: screenPoint.y,
      }}
      value={value}
    />
  );
}

export interface BoardCanvasProps {
  readonly activeTool: ActiveToolId;
  readonly announce: (message: string) => void;
  readonly clipboard: BoardClipboardController;
  readonly document: BoardDocument;
  readonly drawing: BoardDrawingController;
  readonly eraser: BoardEraserController;
  readonly handwriting: BoardHandwritingController;
  readonly interaction: BoardInteractionRouter;
  readonly laser: LaserPointerController;
  readonly onObjectSettingsRequest: (objectId: BoardObjectId) => void;
  readonly onPointerHover: (cursor: Vec2) => void;
  readonly onTransformPreviewChange: (
    transforms: readonly BoardObjectTransformSnapshot[] | null,
  ) => void;
  readonly onViewportCommit: (viewport: ViewportState) => void;
  readonly plots: CoordinatePlotController;
  readonly readOnly: boolean;
  readonly remoteCursors: readonly {
    readonly actorId: string;
    readonly point: { readonly x: number; readonly y: number };
  }[];
  readonly remoteInkPreviews: readonly {
    readonly actorId: string;
    readonly clientId: string;
    readonly displayName: string;
    readonly points: readonly Vec2[];
    readonly previewId: string;
    readonly style: {
      readonly opacity: number;
      readonly stroke: string;
      readonly strokeWidth: number;
    };
  }[];
  readonly remoteTransformPreviews: readonly {
    readonly actorId: string;
    readonly clientId: string;
    readonly displayName: string;
    readonly previewId: string;
    readonly transforms: readonly {
      readonly objectId: string;
      readonly position: Vec2;
      readonly rotation: number;
      readonly scale: Vec2;
    }[];
  }[];
  readonly scene: BoardSceneReadModel;
  readonly selection: BoardSelectionController;
  readonly solid3D: BoardSolid3DController;
}

export function BoardCanvas({
  activeTool,
  announce,
  clipboard,
  document,
  drawing,
  eraser,
  handwriting,
  interaction,
  laser,
  onObjectSettingsRequest,
  onPointerHover,
  onTransformPreviewChange,
  onViewportCommit,
  plots,
  readOnly,
  remoteCursors,
  remoteInkPreviews,
  remoteTransformPreviews,
  scene,
  selection,
  solid3D,
}: BoardCanvasProps) {
  const [contextMenu, setContextMenu] =
    useState<CanvasContextMenuRequest | null>(null);
  const [clearConfirmationOpen, setClearConfirmationOpen] = useState(false);
  const registry = useMemo(() => createDefaultKonvaRendererRegistry(), []);
  const eraserHiddenIds = useMemo(
    () =>
      activeTool === eraserToolId && eraser.preview !== null
        ? new Set(eraser.preview.hiddenObjectIds)
        : new Set<BoardObjectId>(),
    [activeTool, eraser.preview],
  );
  const renderedScene = useMemo(
    () =>
      eraserHiddenIds.size === 0
        ? scene
        : {
            ...scene,
            items: scene.items.filter(
              ({ object }) => !eraserHiddenIds.has(object.id),
            ),
          },
    [eraserHiddenIds, scene],
  );
  const previewItems = useMemo(
    () => [
      ...(activeTool === eraserToolId && eraser.preview !== null
        ? eraser.preview.replacementObjects.map((object) => ({
            object,
            transforms: [],
          }))
        : []),
      ...(drawing.preview === null
        ? []
        : [{ object: drawing.preview, transforms: [] }]),
      ...handwriting.previewItems,
      ...remoteTransformPreviews.flatMap((preview, previewIndex) =>
        preview.transforms.flatMap((transform, transformIndex) => {
          const object = document.objects[transform.objectId as BoardObjectId];
          if (object === undefined) return [];
          return [
            {
              object: {
                ...object,
                id: boardObjectId(`preview:${previewIndex}:${transformIndex}`),
                position: transform.position,
                rotation: transform.rotation,
                scale: transform.scale,
                style: {
                  ...object.style,
                  opacity: Math.min(object.style.opacity, 0.45),
                },
              },
              transforms: [],
            } satisfies BoardRenderItem,
          ];
        }),
      ),
    ],
    [
      activeTool,
      document.objects,
      drawing.preview,
      eraser.preview,
      handwriting.previewItems,
      remoteTransformPreviews,
    ],
  );
  const wetInkStyle = useMemo(() => {
    const style =
      activeTool === "drawing.pen" || activeTool === "drawing.smart-ink"
        ? drawing.styleFor(activeTool)
        : activeTool === handwrittenFunctionToolId
          ? drawingStyleDefaults.pen
          : null;
    if (style === null) return null;
    const strokeStyle = "strokeStyle" in style ? style.strokeStyle : undefined;
    return {
      opacity: style.opacity,
      stroke: style.stroke ?? drawingStyleDefaults.pen.stroke,
      ...(strokeStyle === undefined ? {} : { strokeStyle }),
      strokeWidth: style.strokeWidth,
    };
  }, [activeTool, drawing]);
  const transformableObjectIds =
    plots.editor === null && isSelectionToolId(activeTool)
      ? selection.transformableObjectIds
      : [];
  const textPlacement =
    drawing.state.kind === "placing-text" ? drawing.state : null;
  const textPlacementScreenPoint =
    textPlacement === null
      ? null
      : {
          x:
            textPlacement.position.x * document.viewport.zoom +
            document.viewport.offset.x,
          y:
            textPlacement.position.y * document.viewport.zoom +
            document.viewport.offset.y,
        };

  useEffect(() => {
    if (!readOnly || textPlacement === null) return;
    interaction.activate(selectionToolId);
    announce("Ввод текста отменён: доска доступна только для чтения");
  }, [announce, interaction, readOnly, textPlacement]);

  const clearCanvas = () => {
    const result = clipboard.clearAll();
    if (!result.ok) return;
    interaction.resetAfterClear();
    plots.close();
    solid3D.close();
    onTransformPreviewChange(null);
    clearCoordinatePlotSamplingCache();
    setClearConfirmationOpen(false);
    setContextMenu(null);
    if (result.count > 0)
      announce(`Холст очищен: удалено объектов ${result.count}`);
  };

  return (
    <>
      <BoardStage
        coordinatePlotInteraction={plots.renderInteraction}
        drawingConstraintFeedback={drawing.constraintFeedback}
        eraserPoint={activeTool === eraserToolId ? eraser.point : null}
        eraserRadiusPx={eraser.radiusPx}
        drawingModeKey={
          isDrawingToolId(activeTool) ||
          activeTool === handwrittenFunctionToolId ||
          activeTool === eraserToolId ||
          activeTool === laserToolId ||
          activeTool === geometryPlacementToolId
            ? activeTool
            : null
        }
        laserActive={activeTool === laserToolId}
        laserPoint={laser.point}
        laserTrailOpacity={laser.trailOpacity}
        laserTrailPoints={laser.trailPoints}
        onCanvasContextMenuRequest={(request) => {
          setClearConfirmationOpen(false);
          setContextMenu(request);
        }}
        onCanvasPrimaryClickRequest={() => {
          if (readOnly) return;
          setContextMenu(null);
          interaction.activate("drawing.smart-ink");
          announce("Включён режим Smart Ink");
        }}
        onCanvasPrimaryDoubleClickRequest={() => {
          setContextMenu(null);
          interaction.activate(selectionToolId);
          announce("Включён режим выделения");
        }}
        onWorldPointerBatch={interaction.moveBatch}
        onWorldModifiersChange={interaction.modifiersChange}
        onWorldPointerCancel={interaction.cancel}
        onWorldPointerFinish={interaction.finish}
        onWorldPointerMove={interaction.move}
        onWorldPointerHover={(cursor) => {
          onPointerHover(cursor);
          if (activeTool === eraserToolId) eraser.hover(cursor);
          if (activeTool === laserToolId) laser.hover(cursor);
        }}
        onWorldPointerStart={interaction.start}
        onObjectProximityHitRequest={(point, toleranceWorld) =>
          selectTopObjectIdNearPoint(scene, point, toleranceWorld)
        }
        onObjectSettingsRequest={onObjectSettingsRequest}
        onPanModeRequest={() => interaction.activate(navigationToolId)}
        onSelectionPointerCancel={interaction.selectionCancel}
        onSelectionPointerFinish={interaction.selectionFinish}
        onSelectionPointerMove={interaction.selectionMove}
        onSelectionPointerStart={interaction.selectionStart}
        onSelectionTransform={(transforms) => {
          selection.commitTransform(transforms);
          onTransformPreviewChange(null);
        }}
        onSelectionTransformPreview={onTransformPreviewChange}
        onViewportCommit={onViewportCommit}
        panMode={activeTool === navigationToolId}
        primaryCanvasGesturesEnabled={
          activeTool === navigationToolId || isSelectionToolId(activeTool)
        }
        previewItems={previewItems}
        registry={registry}
        remoteCursors={remoteCursors}
        remoteInkPreviews={remoteInkPreviews}
        scene={renderedScene}
        selectedObjectIds={selection.state.selectedObjectIds}
        selectionBounds={selection.bounds}
        selectionLasso={selection.lasso}
        selectionMarquee={selection.marquee}
        selectionModeKey={isSelectionToolId(activeTool) ? activeTool : null}
        selectionPreviewDelta={selection.previewDelta}
        transformableObjectIds={transformableObjectIds}
        wetInkStyle={wetInkStyle}
      />
      {readOnly ||
      textPlacement === null ||
      textPlacementScreenPoint === null ? null : (
        <InlineTextPlacementEditor
          onCancel={() => {
            interaction.activate(selectionToolId);
            announce("Ввод текста отменён");
          }}
          onChange={drawing.setTextDraft}
          onCommit={() => {
            drawing.commitTextPlacement();
          }}
          screenPoint={textPlacementScreenPoint}
          value={textPlacement.text}
        />
      )}
      {contextMenu === null ? null : (
        <CanvasContextMenu
          canClear={document.order.length > 0}
          canCopy={
            contextMenu.objectId !== null &&
            selection.state.selectedObjectIds.includes(contextMenu.objectId)
          }
          canPaste={clipboard.hasContent}
          canOpenSolid3D={solid3D.selectedRecord !== null}
          context={contextMenu.objectId === null ? "canvas" : "selection"}
          disabled={readOnly}
          onClearRequest={() => {
            setContextMenu(null);
            setClearConfirmationOpen(true);
          }}
          onClose={() => setContextMenu(null)}
          onCopy={() => {
            clipboard.copy();
            setContextMenu(null);
          }}
          onOpenSolid3D={() => {
            solid3D.openSelected();
            setContextMenu(null);
          }}
          onPaste={() => {
            clipboard.paste();
            setContextMenu(null);
          }}
          onText={() => {
            drawing.insertTextAt(contextMenu.worldPoint);
            setContextMenu(null);
          }}
          position={contextMenu.clientPoint}
        />
      )}
      {clearConfirmationOpen ? (
        <ClearCanvasDialog
          objectCount={document.order.length}
          onCancel={() => setClearConfirmationOpen(false)}
          onConfirm={clearCanvas}
        />
      ) : null}
    </>
  );
}
