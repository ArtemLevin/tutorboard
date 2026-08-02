import Konva from "konva";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { Arrow, Group, Line, Rect, Text } from "react-konva";

import {
  createPlotSamplingCache,
  type CoordinatePlotObject,
  type CoordinatePlotSeriesSamplingResult,
  type CoordinatePlotViewport,
  type PlotSeries,
  type PlotSeriesId,
  type Vec2,
} from "../../core/public";
import {
  panCoordinatePlotViewport,
  pinchCoordinatePlotViewport,
  zoomCoordinatePlotViewportAt,
  type CoordinatePlotZoomAxis,
} from "./coordinate-plot-editing";
import { createCoordinatePlotRenderModel } from "./coordinate-plot-render-model";
import {
  createPlotLegendLayout,
  flattenPlotSegment,
  plotLineDash,
} from "./coordinate-plot-rendering";

const coordinatePlotSamplingCache = createPlotSamplingCache();
const tickFontSize = 11;
const axisLabelFontSize = 13;
const plotWheelZoomStep = 1.12;

interface PlotViewportDragSession {
  readonly startPointer: Vec2;
  readonly startViewport: CoordinatePlotViewport;
}

interface PlotViewportPinchSession {
  readonly startTouches: readonly [Vec2, Vec2];
  readonly startViewport: CoordinatePlotViewport;
}

interface PlotViewportRightDragSession extends PlotViewportDragSession {
  readonly captureElement: HTMLElement;
  readonly node: Konva.Node;
  readonly pointerId: number;
  readonly size: { readonly height: number; readonly width: number };
}

function localPointer(node: Konva.Node): Vec2 | null {
  const stage = node.getStage();
  const pointer = stage?.getPointerPosition();
  if (pointer === null || pointer === undefined) return null;
  const local = node.getAbsoluteTransform().copy().invert().point(pointer);
  return Number.isFinite(local.x) && Number.isFinite(local.y) ? local : null;
}

function localClientPointer(
  node: Konva.Node,
  clientX: number,
  clientY: number,
): Vec2 | null {
  const stage = node.getStage();
  const container = stage?.container();
  if (stage === null || stage === undefined || container === undefined)
    return null;
  const bounds = container.getBoundingClientRect();
  const local = node
    .getAbsoluteTransform()
    .copy()
    .invert()
    .point({ x: clientX - bounds.left, y: clientY - bounds.top });
  return Number.isFinite(local.x) && Number.isFinite(local.y) ? local : null;
}

function localTouchPair(
  node: Konva.Node,
  touches: TouchList,
): readonly [Vec2, Vec2] | null {
  const first = touches.item(0);
  const second = touches.item(1);
  if (first === null || second === null) return null;
  const firstPoint = localClientPointer(node, first.clientX, first.clientY);
  const secondPoint = localClientPointer(node, second.clientX, second.clientY);
  return firstPoint === null || secondPoint === null
    ? null
    : [firstPoint, secondPoint];
}

export interface CoordinatePlotRendererProps {
  readonly editing?: boolean | undefined;
  readonly object: CoordinatePlotObject;
  readonly onEditRequest?: (() => void) | undefined;
  readonly onSelectedSeriesChange?:
    ((seriesId: PlotSeriesId | null) => void) | undefined;
  readonly onViewportChange?:
    ((viewport: CoordinatePlotViewport) => void) | undefined;
  readonly selectedSeriesId?: PlotSeriesId | null | undefined;
  readonly zoom: number;
  readonly zoomAxis?: CoordinatePlotZoomAxis | undefined;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function optionalDash(dash: readonly number[]) {
  return dash.length === 0 ? {} : { dash: [...dash] };
}

function AxisLine({
  arrows,
  points,
  stroke,
}: {
  readonly arrows: boolean;
  readonly points: readonly number[];
  readonly stroke: string;
}): ReactElement {
  return arrows ? (
    <Arrow
      fill={stroke}
      listening={false}
      pointerLength={8}
      pointerWidth={7}
      points={[...points]}
      stroke={stroke}
      strokeWidth={1.6}
    />
  ) : (
    <Line
      listening={false}
      points={[...points]}
      stroke={stroke}
      strokeWidth={1.6}
    />
  );
}

function seriesStatusLabel(
  result: CoordinatePlotSeriesSamplingResult | undefined,
): string {
  if (result === undefined) return "";
  if (result.status === "invalid") return "⚠";
  if (result.status === "truncated") return "…";
  if (result.status === "aborted") return "×";
  return "";
}

function seriesOpacity(
  series: PlotSeries,
  highlightedSeriesId: PlotSeriesId | null,
): number {
  if (highlightedSeriesId === null || highlightedSeriesId === series.id) {
    return series.style.opacity;
  }
  return series.style.opacity * 0.38;
}

export function CoordinatePlotRenderer({
  editing = false,
  object,
  onEditRequest,
  onSelectedSeriesChange,
  onViewportChange,
  selectedSeriesId,
  zoom,
  zoomAxis = "both",
}: CoordinatePlotRendererProps): ReactElement {
  const [internalSelectedSeriesId, setInternalSelectedSeriesId] =
    useState<PlotSeriesId | null>(null);
  const [hoveredSeriesId, setHoveredSeriesId] = useState<PlotSeriesId | null>(
    null,
  );
  const viewportDragRef = useRef<PlotViewportDragSession | null>(null);
  const viewportPinchRef = useRef<PlotViewportPinchSession | null>(null);
  const viewportRightDragRef = useRef<PlotViewportRightDragSession | null>(
    null,
  );
  const viewportChangeRef = useRef(onViewportChange);
  const cursorContainerRef = useRef<HTMLElement | null>(null);
  const cursorCleanupRef = useRef<(() => void) | null>(null);
  const cursorPressedRef = useRef(false);
  useEffect(() => {
    viewportChangeRef.current = onViewportChange;
  }, [onViewportChange]);
  const bindCursorContainer = (container: HTMLElement) => {
    if (cursorContainerRef.current === container) return;
    cursorCleanupRef.current?.();
    const handlePointerDown = () => {
      cursorPressedRef.current = true;
      if (container.style.cursor === "grab") {
        container.style.cursor = "grabbing";
      }
    };
    const handlePointerEnd = () => {
      cursorPressedRef.current = false;
      if (container.style.cursor === "grabbing") {
        container.style.cursor = "grab";
      }
    };
    container.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("pointerup", handlePointerEnd, true);
    window.addEventListener("pointercancel", handlePointerEnd, true);
    cursorContainerRef.current = container;
    cursorCleanupRef.current = () => {
      container.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("pointerup", handlePointerEnd, true);
      window.removeEventListener("pointercancel", handlePointerEnd, true);
    };
  };
  const setPlotCursor = (
    node: Konva.Node,
    cursor: "" | "grab" | "grabbing",
  ) => {
    const container = node.getStage()?.container();
    if (container === undefined) return;
    bindCursorContainer(container);
    container.style.cursor =
      cursor === "grab" && cursorPressedRef.current ? "grabbing" : cursor;
  };

  const finishRightViewportDrag = useCallback((event?: PointerEvent) => {
    const session = viewportRightDragRef.current;
    if (session === null) return;
    viewportRightDragRef.current = null;
    if (session.captureElement.hasPointerCapture(session.pointerId)) {
      session.captureElement.releasePointerCapture(session.pointerId);
    }
    cursorPressedRef.current = false;
    const pointer =
      event === undefined
        ? null
        : localClientPointer(session.node, event.clientX, event.clientY);
    const inside =
      pointer !== null &&
      pointer.x >= 0 &&
      pointer.x <= session.size.width &&
      pointer.y >= 0 &&
      pointer.y <= session.size.height;
    session.captureElement.style.cursor = inside ? "grab" : "";
  }, []);

  const startRightViewportDrag = useCallback(
    (
      event: Konva.KonvaEventObject<PointerEvent>,
      startViewport: CoordinatePlotViewport,
      size: { readonly height: number; readonly width: number },
    ) => {
      if (
        event.evt.button !== 2 ||
        viewportChangeRef.current === undefined ||
        viewportRightDragRef.current !== null
      ) {
        return false;
      }
      event.cancelBubble = true;
      event.evt.preventDefault();
      event.evt.stopPropagation();
      const pointer = localPointer(event.currentTarget);
      const container = event.currentTarget.getStage()?.container();
      if (pointer === null || container === undefined) return false;
      event.currentTarget.stopDrag();
      viewportDragRef.current = null;
      viewportPinchRef.current = null;
      bindCursorContainer(container);
      container.setPointerCapture(event.evt.pointerId);
      viewportRightDragRef.current = {
        captureElement: container,
        node: event.currentTarget,
        pointerId: event.evt.pointerId,
        size,
        startPointer: pointer,
        startViewport,
      };
      cursorPressedRef.current = true;
      container.style.cursor = "grabbing";
      return true;
    },
    [],
  );

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const session = viewportRightDragRef.current;
      if (session === null || session.pointerId !== event.pointerId) return;
      if ((event.buttons & 2) === 0) {
        finishRightViewportDrag(event);
        return;
      }
      event.preventDefault();
      const pointer = localClientPointer(
        session.node,
        event.clientX,
        event.clientY,
      );
      if (pointer === null) return;
      viewportChangeRef.current?.(
        panCoordinatePlotViewport(session.startViewport, session.size, {
          x: pointer.x - session.startPointer.x,
          y: pointer.y - session.startPointer.y,
        }),
      );
    };
    const handlePointerUp = (event: PointerEvent) => {
      if (viewportRightDragRef.current?.pointerId === event.pointerId) {
        finishRightViewportDrag(event);
      }
    };
    const handlePointerCancel = (event: PointerEvent) => {
      if (viewportRightDragRef.current?.pointerId === event.pointerId) {
        finishRightViewportDrag();
      }
    };
    const handleBlur = () => finishRightViewportDrag();
    window.addEventListener("pointermove", handlePointerMove, {
      passive: false,
    });
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      window.removeEventListener("blur", handleBlur);
      finishRightViewportDrag();
    };
  }, [finishRightViewportDrag]);
  useEffect(
    () => () => {
      cursorCleanupRef.current?.();
      cursorCleanupRef.current = null;
      cursorPressedRef.current = false;
      if (cursorContainerRef.current !== null) {
        cursorContainerRef.current.style.cursor = "";
      }
      cursorContainerRef.current = null;
    },
    [],
  );
  useEffect(() => {
    if (editing) return;
    viewportDragRef.current = null;
    viewportPinchRef.current = null;
    finishRightViewportDrag();
    cursorPressedRef.current = false;
    if (cursorContainerRef.current !== null) {
      cursorContainerRef.current.style.cursor = "";
    }
  }, [editing, finishRightViewportDrag]);
  const model = useMemo(
    () =>
      createCoordinatePlotRenderModel({
        cache: coordinatePlotSamplingCache,
        object,
        zoom,
      }),
    [object, zoom],
  );
  const resultBySeriesId = useMemo(
    () =>
      new Map(model.sampling.series.map((result) => [result.seriesId, result])),
    [model.sampling.series],
  );
  const controlled = selectedSeriesId !== undefined;
  const activeSelectedSeriesId = controlled
    ? selectedSeriesId
    : internalSelectedSeriesId;
  const visibleSeriesIds = new Set(
    model.definition.series
      .filter(({ visible }) => visible)
      .map(({ id }) => id),
  );
  const resolvedSelectedSeriesId =
    activeSelectedSeriesId !== null &&
    visibleSeriesIds.has(activeSelectedSeriesId)
      ? activeSelectedSeriesId
      : null;
  const highlightedSeriesId = resolvedSelectedSeriesId ?? hoveredSeriesId;
  const { definition, grid, sampling, xAxisY, yAxisX } = model;
  const { height, width } = definition.size;
  const fill = object.style.fill ?? "#ffffff";
  const frameStroke = object.style.stroke ?? "#64748b";
  const gridStroke = object.style.stroke ?? "#475569";
  const axisStroke = "#1e293b";
  const visibleSeries = definition.series.filter(({ visible }) => visible);
  const legend = createPlotLegendLayout(
    definition.legend.position,
    visibleSeries.map(({ name }) => name),
    definition.size,
  );
  const xTickY = clamp((xAxisY ?? height) + 4, 2, Math.max(2, height - 17));
  const yTickX = clamp((yAxisX ?? 0) - 58, 2, Math.max(2, width - 60));
  const problematicSeriesCount = sampling.series.filter(
    ({ status }) =>
      status === "invalid" || status === "truncated" || status === "aborted",
  ).length;
  const legendSeries = visibleSeries.slice(0, legend.visibleRowCount);

  const selectSeries = (seriesId: PlotSeriesId | null) => {
    if (!controlled) setInternalSelectedSeriesId(seriesId);
    onSelectedSeriesChange?.(seriesId);
  };

  return (
    <Group
      name="board-transform-target coordinate-plot-root"
      onDblClick={(event) => {
        if (onEditRequest === undefined) return;
        event.cancelBubble = true;
        onEditRequest();
      }}
      opacity={object.style.opacity}
      rotation={object.rotation}
      scaleX={object.scale.x}
      scaleY={object.scale.y}
      visible={object.visible}
      x={object.position.x}
      y={object.position.y}
    >
      <Rect fill={fill} height={height} width={width} />
      <Group
        clipHeight={height}
        clipWidth={width}
        clipX={0}
        clipY={0}
        onWheel={(event) => {
          if (!editing || onViewportChange === undefined) return;
          event.cancelBubble = true;
          event.evt.preventDefault();
          const pointer = localPointer(event.currentTarget);
          if (pointer === null) return;
          const direction =
            (event.evt.deltaY < 0 ? -1 : 1) * (event.evt.ctrlKey ? -1 : 1);
          const axis = event.evt.shiftKey
            ? "x"
            : event.evt.altKey
              ? "y"
              : zoomAxis;
          onViewportChange(
            zoomCoordinatePlotViewportAt(
              definition.coordinateViewport,
              definition.size,
              pointer,
              direction < 0 ? 1 / plotWheelZoomStep : plotWheelZoomStep,
              axis,
            ),
          );
        }}
      >
        {definition.grid.visible &&
          definition.grid.minorVisible &&
          grid.minorX.map((position, index) => (
            <Line
              key={`minor-x-${index}`}
              listening={false}
              opacity={0.08}
              points={[position, 0, position, height]}
              stroke={gridStroke}
              strokeWidth={1}
            />
          ))}
        {definition.grid.visible &&
          definition.grid.minorVisible &&
          grid.minorY.map((position, index) => (
            <Line
              key={`minor-y-${index}`}
              listening={false}
              opacity={0.08}
              points={[0, position, width, position]}
              stroke={gridStroke}
              strokeWidth={1}
            />
          ))}
        {definition.grid.visible &&
          definition.grid.majorVisible &&
          grid.majorX.map((tick) => (
            <Line
              key={`major-x-${tick.value}`}
              listening={false}
              opacity={tick.value === 0 ? 0 : 0.18}
              points={[tick.position, 0, tick.position, height]}
              stroke={gridStroke}
              strokeWidth={1}
            />
          ))}
        {definition.grid.visible &&
          definition.grid.majorVisible &&
          grid.majorY.map((tick) => (
            <Line
              key={`major-y-${tick.value}`}
              listening={false}
              opacity={tick.value === 0 ? 0 : 0.18}
              points={[0, tick.position, width, tick.position]}
              stroke={gridStroke}
              strokeWidth={1}
            />
          ))}
        {definition.axes.showXAxis && xAxisY !== null && (
          <AxisLine
            arrows={definition.axes.showArrows}
            points={[0, xAxisY, width, xAxisY]}
            stroke={axisStroke}
          />
        )}
        {definition.axes.showYAxis && yAxisX !== null && (
          <AxisLine
            arrows={definition.axes.showArrows}
            points={[yAxisX, height, yAxisX, 0]}
            stroke={axisStroke}
          />
        )}
        {definition.axes.showLabels &&
          grid.majorX.map((tick) => (
            <Text
              align="center"
              fill={axisStroke}
              fontSize={tickFontSize}
              key={`x-label-${tick.value}`}
              listening={false}
              text={tick.label}
              width={64}
              x={clamp(tick.position - 32, 2, Math.max(2, width - 66))}
              y={xTickY}
            />
          ))}
        {definition.axes.showLabels &&
          grid.majorY
            .filter(({ value }) => value !== 0)
            .map((tick) => (
              <Text
                align="right"
                fill={axisStroke}
                fontSize={tickFontSize}
                key={`y-label-${tick.value}`}
                listening={false}
                text={tick.label}
                width={56}
                x={yTickX}
                y={clamp(tick.position - 7, 2, Math.max(2, height - 16))}
              />
            ))}
        {definition.axes.showLabels &&
          definition.axes.showXAxis &&
          xAxisY !== null && (
            <Text
              fill={axisStroke}
              fontSize={axisLabelFontSize}
              fontStyle="bold"
              listening={false}
              text={definition.axes.xLabel}
              x={Math.max(2, width - 18)}
              y={clamp(xAxisY - 19, 2, Math.max(2, height - 18))}
            />
          )}
        {definition.axes.showLabels &&
          definition.axes.showYAxis &&
          yAxisX !== null && (
            <Text
              fill={axisStroke}
              fontSize={axisLabelFontSize}
              fontStyle="bold"
              listening={false}
              text={definition.axes.yLabel}
              x={clamp(yAxisX + 7, 2, Math.max(2, width - 18))}
              y={2}
            />
          )}
        {editing && onViewportChange !== undefined ? (
          <Rect
            dragBoundFunc={() => ({ x: 0, y: 0 })}
            draggable
            fill="rgba(15,23,42,0.001)"
            height={height}
            name="coordinate-plot-pan-surface"
            onMouseEnter={(event) => setPlotCursor(event.currentTarget, "grab")}
            onMouseLeave={(event) => {
              if (
                viewportDragRef.current === null &&
                viewportPinchRef.current === null
              ) {
                setPlotCursor(event.currentTarget, "");
              }
            }}
            onDragEnd={(event) => {
              setPlotCursor(event.currentTarget, "grab");
              event.cancelBubble = true;
              const session = viewportDragRef.current;
              const pointer = localPointer(event.currentTarget);
              viewportDragRef.current = null;
              if (session === null || pointer === null) return;
              onViewportChange(
                panCoordinatePlotViewport(
                  session.startViewport,
                  definition.size,
                  {
                    x: pointer.x - session.startPointer.x,
                    y: pointer.y - session.startPointer.y,
                  },
                ),
              );
            }}
            onDragMove={(event) => {
              event.cancelBubble = true;
              const session = viewportDragRef.current;
              const pointer = localPointer(event.currentTarget);
              if (session === null || pointer === null) return;
              onViewportChange(
                panCoordinatePlotViewport(
                  session.startViewport,
                  definition.size,
                  {
                    x: pointer.x - session.startPointer.x,
                    y: pointer.y - session.startPointer.y,
                  },
                ),
              );
            }}
            onDragStart={(event) => {
              event.cancelBubble = true;
              setPlotCursor(event.currentTarget, "grabbing");
              const pointer = localPointer(event.currentTarget);
              if (pointer === null) return;
              viewportDragRef.current = {
                startPointer: pointer,
                startViewport: definition.coordinateViewport,
              };
            }}
            onPointerDown={(event) => {
              if (
                startRightViewportDrag(
                  event,
                  definition.coordinateViewport,
                  definition.size,
                )
              ) {
                return;
              }
              event.cancelBubble = true;
              event.evt.preventDefault();
              setPlotCursor(event.currentTarget, "grabbing");
            }}
            onTouchStart={(event) => {
              if (event.evt.touches.length < 2) return;
              event.cancelBubble = true;
              event.evt.preventDefault();
              const touches = localTouchPair(
                event.currentTarget,
                event.evt.touches,
              );
              if (touches === null) return;
              event.currentTarget.stopDrag();
              viewportDragRef.current = null;
              viewportPinchRef.current = {
                startTouches: touches,
                startViewport: definition.coordinateViewport,
              };
              setPlotCursor(event.currentTarget, "grabbing");
            }}
            onTouchMove={(event) => {
              const session = viewportPinchRef.current;
              if (session === null || event.evt.touches.length < 2) return;
              event.cancelBubble = true;
              event.evt.preventDefault();
              const touches = localTouchPair(
                event.currentTarget,
                event.evt.touches,
              );
              if (touches === null) return;
              onViewportChange(
                pinchCoordinatePlotViewport(
                  session.startViewport,
                  definition.size,
                  session.startTouches,
                  touches,
                  zoomAxis,
                ),
              );
            }}
            onTouchEnd={(event) => {
              if (event.evt.touches.length >= 2) return;
              viewportPinchRef.current = null;
              setPlotCursor(event.currentTarget, "grab");
            }}
            onTouchCancel={() => {
              viewportPinchRef.current = null;
              viewportDragRef.current = null;
              cursorPressedRef.current = false;
              if (cursorContainerRef.current !== null) {
                cursorContainerRef.current.style.cursor = "";
              }
            }}
            width={width}
          />
        ) : null}
        {visibleSeries.flatMap((series) => {
          const result = resultBySeriesId.get(series.id);
          if (result?.sample === null || result?.sample === undefined)
            return [];
          const selected = highlightedSeriesId === series.id;
          const dash = plotLineDash(
            series.style.lineStyle,
            series.style.strokeWidth,
          );
          return result.sample.segments.flatMap((segment, segmentIndex) => {
            if (segment.length < 2) return [];
            const points = flattenPlotSegment(segment);
            const key = `${series.id}-${segmentIndex}`;
            return [
              ...(selected
                ? [
                    <Line
                      key={`${key}-selection`}
                      lineCap="round"
                      lineJoin="round"
                      listening={false}
                      opacity={0.22}
                      perfectDrawEnabled={false}
                      points={[...points]}
                      stroke="#0f172a"
                      strokeWidth={series.style.strokeWidth + 7}
                    />,
                  ]
                : []),
              <Line
                {...optionalDash(dash)}
                hitStrokeWidth={Math.max(14, series.style.strokeWidth + 10)}
                id={`plot-series-${series.id}`}
                key={key}
                lineCap="round"
                lineJoin="round"
                name="coordinate-plot-series"
                onClick={() => selectSeries(series.id)}
                onMouseEnter={() => setHoveredSeriesId(series.id)}
                onMouseLeave={() =>
                  setHoveredSeriesId((current) =>
                    current === series.id ? null : current,
                  )
                }
                onPointerDown={(event) => {
                  if (!editing) return;
                  if (
                    startRightViewportDrag(
                      event,
                      definition.coordinateViewport,
                      definition.size,
                    )
                  ) {
                    return;
                  }
                  event.cancelBubble = true;
                  event.evt.preventDefault();
                }}
                onTap={() => selectSeries(series.id)}
                opacity={seriesOpacity(series, highlightedSeriesId)}
                perfectDrawEnabled={false}
                points={[...points]}
                stroke={series.style.stroke}
                strokeWidth={series.style.strokeWidth}
              />,
            ];
          });
        })}
      </Group>
      <Rect
        height={height}
        hitStrokeWidth={Math.max(14, object.style.strokeWidth)}
        listening={false}
        stroke={frameStroke}
        strokeWidth={Math.max(1, object.style.strokeWidth)}
        width={width}
      />
      {definition.legend.visible && visibleSeries.length > 0 && (
        <Group x={legend.x} y={legend.y}>
          <Rect
            cornerRadius={8}
            fill="rgba(255,255,255,0.94)"
            height={legend.height}
            shadowBlur={8}
            shadowColor="rgba(15,23,42,0.18)"
            shadowOffsetY={2}
            stroke="rgba(100,116,139,0.45)"
            strokeWidth={1}
            width={legend.width}
          />
          {legendSeries.map((series, index) => {
            const selected = resolvedSelectedSeriesId === series.id;
            const result = resultBySeriesId.get(series.id);
            const dash = plotLineDash(
              series.style.lineStyle,
              series.style.strokeWidth,
            );
            const rowY = 6 + index * legend.rowHeight;
            return (
              <Group
                key={series.id}
                name="coordinate-plot-legend-row"
                onClick={() => selectSeries(series.id)}
                onMouseEnter={() => setHoveredSeriesId(series.id)}
                onMouseLeave={() =>
                  setHoveredSeriesId((current) =>
                    current === series.id ? null : current,
                  )
                }
                onPointerDown={(event) => {
                  if (!editing) return;
                  event.cancelBubble = true;
                  event.evt.preventDefault();
                }}
                onTap={() => selectSeries(series.id)}
                y={rowY}
              >
                <Rect
                  cornerRadius={5}
                  fill={selected ? "rgba(59,130,246,0.12)" : "transparent"}
                  height={legend.rowHeight - 2}
                  width={legend.width - 8}
                  x={4}
                />
                <Line
                  {...optionalDash(dash)}
                  lineCap="round"
                  listening={false}
                  opacity={series.style.opacity}
                  points={[12, 11, 42, 11]}
                  stroke={series.style.stroke}
                  strokeWidth={series.style.strokeWidth}
                />
                <Text
                  ellipsis
                  fill="#0f172a"
                  fontSize={12}
                  fontStyle={selected ? "bold" : "normal"}
                  height={legend.rowHeight - 2}
                  listening={false}
                  text={`${seriesStatusLabel(result)}${series.name}`}
                  verticalAlign="middle"
                  width={Math.max(0, legend.width - 58)}
                  x={50}
                />
              </Group>
            );
          })}
          {legend.hiddenRowCount > 0 ? (
            <Group
              listening={false}
              name="coordinate-plot-legend-overflow"
              y={6 + legend.visibleRowCount * legend.rowHeight}
            >
              <Rect
                cornerRadius={5}
                fill="rgba(241,245,249,0.96)"
                height={legend.rowHeight - 2}
                width={legend.width - 8}
                x={4}
              />
              <Text
                align="center"
                fill="#475569"
                fontSize={12}
                fontStyle="bold"
                height={legend.rowHeight - 2}
                text={`Ещё ${legend.hiddenRowCount}`}
                verticalAlign="middle"
                width={legend.width - 12}
                x={6}
              />
            </Group>
          ) : null}
        </Group>
      )}
      {editing ? (
        <Text
          align="center"
          fill="#1d4ed8"
          fontSize={12}
          fontStyle="bold"
          listening={false}
          text="Редактирование координатной плоскости"
          width={Math.max(0, width - 32)}
          x={16}
          y={8}
        />
      ) : null}
      {problematicSeriesCount > 0 && (
        <Text
          fill="#b45309"
          fontSize={11}
          listening={false}
          text={`⚠ ${problematicSeriesCount}`}
          x={8}
          y={Math.max(4, height - 18)}
        />
      )}
    </Group>
  );
}
