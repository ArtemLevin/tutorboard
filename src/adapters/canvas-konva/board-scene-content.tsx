import { memo, type ReactElement } from "react";
import { Group } from "react-konva";

import type {
  BoardObjectId,
  BoardRenderItem,
  Transform2D,
} from "../../core/public";
import type { BoardObjectTransformSnapshot } from "./BoardStage";
import type {
  CoordinatePlotRenderInteraction,
  KonvaRendererRegistry,
} from "./renderer-registry";

function applyTransforms(
  child: ReactElement,
  transforms: readonly Transform2D[],
): ReactElement {
  return transforms.reduceRight(
    (nested, transform, index) => (
      <Group
        key={`transform-${index}`}
        rotation={transform.rotation}
        scaleX={transform.scale.x}
        scaleY={transform.scale.y}
        x={transform.translation.x}
        y={transform.translation.y}
      >
        {nested}
      </Group>
    ),
    child,
  );
}

export interface BoardRenderItemViewProps {
  readonly coordinatePlotInteraction?:
    CoordinatePlotRenderInteraction | undefined;
  readonly interactive: boolean;
  readonly item: BoardRenderItem;
  readonly previewX?: number;
  readonly previewY?: number;
  readonly registry: KonvaRendererRegistry;
  readonly zoom: number;
}

export const BoardRenderItemView = memo(function BoardRenderItemView({
  coordinatePlotInteraction,
  interactive,
  item,
  previewX = 0,
  previewY = 0,
  registry,
  zoom,
}: BoardRenderItemViewProps) {
  return (
    <Group
      id={item.object.id}
      listening={interactive}
      {...(interactive ? { name: "board-object" } : {})}
      x={previewX}
      y={previewY}
    >
      {applyTransforms(
        registry.render(item, {
          zoom,
          ...(coordinatePlotInteraction === undefined
            ? {}
            : { coordinatePlot: coordinatePlotInteraction }),
        }),
        item.transforms,
      )}
    </Group>
  );
});

export interface BoardSceneContentProps {
  readonly batches: readonly (readonly BoardRenderItem[])[];
  readonly coordinatePlotInteraction?:
    CoordinatePlotRenderInteraction | undefined;
  readonly lineEndpointPreview: BoardObjectTransformSnapshot | null;
  readonly registry: KonvaRendererRegistry;
  readonly selectedObjectIds: readonly BoardObjectId[];
  readonly selectionPreviewX: number;
  readonly selectionPreviewY: number;
  readonly zoom: number;
}

export const BoardSceneContent = memo(function BoardSceneContent({
  batches,
  coordinatePlotInteraction,
  lineEndpointPreview,
  registry,
  selectedObjectIds,
  selectionPreviewX,
  selectionPreviewY,
  zoom,
}: BoardSceneContentProps) {
  const selected = new Set(selectedObjectIds);
  return batches.map((batch, batchIndex) => (
    <Group key={`render-batch-${batchIndex}`}>
      {batch.map((item) => (
        <BoardRenderItemView
          coordinatePlotInteraction={
            item.object.kind === "math.coordinate-plot"
              ? coordinatePlotInteraction
              : undefined
          }
          interactive
          item={
            lineEndpointPreview?.objectId === item.object.id
              ? {
                  ...item,
                  object: {
                    ...item.object,
                    position: lineEndpointPreview.position,
                    rotation: lineEndpointPreview.rotation,
                    scale: lineEndpointPreview.scale,
                  },
                }
              : item
          }
          key={item.object.id}
          previewX={selected.has(item.object.id) ? selectionPreviewX : 0}
          previewY={selected.has(item.object.id) ? selectionPreviewY : 0}
          registry={registry}
          zoom={zoom}
        />
      ))}
    </Group>
  ));
});
