import {
  memo,
  useLayoutEffect,
  useMemo,
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
import type { BoundedInkCandidate } from "./bounded-ink-candidate";
import { recordBoardFrameTrace } from "./board-frame-trace";
import {
  minimumWheelCacheStrokes,
  type WheelInkCacheCoordinator,
  type WheelInkCrop,
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
  readonly guardedCrop?: WheelInkCrop;
}

function groupInkRenderRuns(
  batches: readonly (readonly BoardRenderItem[])[],
  candidate: BoundedInkCandidate | null,
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
  if (candidate === null) return groups;
  // Only an entire, ordered run within this committed Konva Layer can be
  // separated safely. Splitting preserves all item positions and IDs.
  const firstId = candidate.objectIds[0];
  if (firstId === undefined) return groups;
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const group = groups[groupIndex];
    if (group === undefined || !group.ink) continue;
    const start = group.items.findIndex((item) => item.object.id === firstId);
    if (start < 0 || start + candidate.objectIds.length > group.items.length) {
      continue;
    }
    if (
      !candidate.objectIds.every(
        (id, index) => group.items[start + index]?.object.id === id,
      )
    ) {
      continue;
    }
    const segments: InkRenderRun[] = [];
    const before = group.items.slice(0, start);
    const selected = group.items.slice(
      start,
      start + candidate.objectIds.length,
    );
    const after = group.items.slice(start + candidate.objectIds.length);
    if (before.length > 0)
      segments.push({
        ink: true,
        items: before,
        key: group.key,
      });
    segments.push({
      ink: true,
      items: selected,
      key: `render:ink:${firstId}`,
      guardedCrop: candidate.crop,
    });
    if (after.length > 0)
      segments.push({
        ink: true,
        items: after,
        key: `render:ink:${after[0]!.object.id}`,
      });
    return [
      ...groups.slice(0, groupIndex),
      ...segments,
      ...groups.slice(groupIndex + 1),
    ];
  }
  return groups;
}

function WheelCachedInkGroup({
  children,
  coordinator,
  expectedCrop,
}: {
  readonly children: ReactNode;
  readonly coordinator: WheelInkCacheCoordinator;
  readonly expectedCrop?: WheelInkCrop;
}) {
  const ref = useRef<Konva.Group>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (node === null) return;
    return coordinator.register(node, expectedCrop);
  }, [coordinator, expectedCrop]);
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
  readonly boundedInkCandidate?: BoundedInkCandidate | null;
  readonly experimentalA2?: boolean;
}

interface BoardSceneRunProps {
  readonly run: InkRenderRun;
  readonly selected: ReadonlySet<BoardObjectId>;
  readonly coordinatePlotInteraction:
    CoordinatePlotRenderInteraction | undefined;
  readonly lineEndpointPreview: BoardObjectTransformSnapshot | null;
  readonly registry: KonvaRendererRegistry;
  readonly selectionPreviewX: number;
  readonly selectionPreviewY: number;
  readonly zoom: number;
  readonly wheelInkCache: WheelInkCacheCoordinator | undefined;
  readonly experimentalA2: boolean;
}

/** Freeze immutable pen-only runs across wheel viewport changes. */
const BoardSceneRun = memo(function BoardSceneRun({
  run,
  selected,
  coordinatePlotInteraction,
  lineEndpointPreview,
  registry,
  selectionPreviewX,
  selectionPreviewY,
  zoom,
  wheelInkCache,
  experimentalA2,
}: BoardSceneRunProps) {
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
      zoom={item.object.kind === "drawing.pen-stroke" ? 1 : zoom}
    />
  ));
  const result =
    run.ink &&
    run.items.length >= minimumWheelCacheStrokes &&
    wheelInkCache !== undefined &&
    (run.guardedCrop !== undefined || !experimentalA2) ? (
      <WheelCachedInkGroup
        coordinator={wheelInkCache}
        {...(run.guardedCrop === undefined
          ? {}
          : { expectedCrop: run.guardedCrop })}
      >
        {contents}
      </WheelCachedInkGroup>
    ) : (
      <Group>{contents}</Group>
    );
  useLayoutEffect(() => {
    if (window.__tutorBoardC37Trace === undefined) return;
    // Commit count is tracked without reading a clock during React render.
    // Exclusive subtree render durations require the React profiling build.
    recordBoardFrameTrace(
      run.ink ? "react-ink-run" : "react-other-run",
      performance.now(),
      0,
      String(run.items.length),
    );
  });
  return result;
});

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
  boundedInkCandidate = null,
  experimentalA2 = false,
}: BoardSceneContentProps) {
  const runs = useMemo(
    () => groupInkRenderRuns(batches, boundedInkCandidate),
    [batches, boundedInkCandidate],
  );
  const selected = useMemo(
    () => new Set(selectedObjectIds),
    [selectedObjectIds],
  );
  return runs.map((run) => (
    <BoardSceneRun
      key={run.key}
      run={run}
      selected={selected}
      coordinatePlotInteraction={coordinatePlotInteraction}
      lineEndpointPreview={lineEndpointPreview}
      registry={registry}
      selectionPreviewX={selectionPreviewX}
      selectionPreviewY={selectionPreviewY}
      zoom={run.ink ? 1 : zoom}
      wheelInkCache={wheelInkCache}
      experimentalA2={experimentalA2}
    />
  ));
});
