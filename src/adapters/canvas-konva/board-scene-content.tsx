import {
  memo,
  useLayoutEffect,
  useRef,
  type ReactElement,
  type ReactNode,
} from "react";
import type Konva from "konva";
import { Group } from "react-konva";

import type {
  BoardObjectId,
  BoardRenderItem,
  Transform2D,
} from "../../core/public";
import type { BoardObjectTransformSnapshot } from "./BoardStage";
import {
  minimumWheelCacheStrokes,
  type WheelInkCacheCoordinator,
} from "./wheel-ink-cache";
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
  const visualScale = item.transforms.reduce(
    (scale, transform) =>
      scale *
      Math.max(Math.abs(transform.scale.x), Math.abs(transform.scale.y)),
    1,
  );
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
          visualScale,
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

interface InkRenderRun {
  readonly ink: boolean;
  readonly items: readonly BoardRenderItem[];
  readonly key: string;
}

function groupInkRenderRuns(
  batches: readonly (readonly BoardRenderItem[])[],
): readonly InkRenderRun[] {
  const groups: {
    ink: boolean;
    items: BoardRenderItem[];
    key: string;
  }[] = [];
  for (const batch of batches) {
    for (const item of batch) {
      const ink = item.object.kind === "drawing.pen-stroke";
      const previous = groups.at(-1);
      if (previous === undefined || previous.ink !== ink) {
        groups.push({
          ink,
          items: [item],
          key: `render:${ink ? "ink" : "other"}:${item.object.id}`,
        });
      } else {
        previous.items.push(item);
      }
    }
  }
  return groups;
}

function WheelCachedInkGroup({
  children,
  coordinator,
}: {
  readonly children: ReactNode;
  readonly coordinator: WheelInkCacheCoordinator;
}) {
  const ref = useRef<Konva.Group>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (node === null) return;
    return coordinator.register(node);
  }, [coordinator]);
  return <Group ref={ref}>{children}</Group>;
}

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
  readonly wheelInkCache?: WheelInkCacheCoordinator;
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
  wheelInkCache,
}: BoardSceneContentProps) {
  const selected = new Set(selectedObjectIds);
  return groupInkRenderRuns(batches).map((run) => {
    const contents = run.items.map((item) => (
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
    ));
    if (
      run.ink &&
      run.items.length >= minimumWheelCacheStrokes &&
      wheelInkCache !== undefined
    ) {
      return (
        <WheelCachedInkGroup coordinator={wheelInkCache} key={run.key}>
          {contents}
        </WheelCachedInkGroup>
      );
    }
    return <Group key={run.key}>{contents}</Group>;
  });
});
