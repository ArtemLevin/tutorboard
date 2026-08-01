import { useMemo, useState, type ReactElement } from "react";
import { Arrow, Group, Line, Rect, Text } from "react-konva";

import {
  createPlotSamplingCache,
  type CoordinatePlotObject,
  type CoordinatePlotSeriesSamplingResult,
  type PlotSeries,
  type PlotSeriesId,
} from "../../core/public";
import { createCoordinatePlotRenderModel } from "./coordinate-plot-render-model";
import {
  createPlotLegendLayout,
  flattenPlotSegment,
  plotLineDash,
} from "./coordinate-plot-rendering";

const coordinatePlotSamplingCache = createPlotSamplingCache();
const tickFontSize = 11;
const axisLabelFontSize = 13;

export interface CoordinatePlotRendererProps {
  readonly object: CoordinatePlotObject;
  readonly onSelectedSeriesChange?:
    | ((seriesId: PlotSeriesId | null) => void)
    | undefined;
  readonly selectedSeriesId?: PlotSeriesId | null | undefined;
  readonly zoom: number;
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
  object,
  onSelectedSeriesChange,
  selectedSeriesId,
  zoom,
}: CoordinatePlotRendererProps): ReactElement {
  const [internalSelectedSeriesId, setInternalSelectedSeriesId] =
    useState<PlotSeriesId | null>(null);
  const [hoveredSeriesId, setHoveredSeriesId] =
    useState<PlotSeriesId | null>(null);
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
      new Map(
        model.sampling.series.map((result) => [result.seriesId, result]),
      ),
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
    ({ status }) => status === "invalid" || status === "truncated",
  ).length;

  const selectSeries = (seriesId: PlotSeriesId | null) => {
    if (!controlled) setInternalSelectedSeriesId(seriesId);
    onSelectedSeriesChange?.(seriesId);
  };

  return (
    <Group
      name="board-transform-target coordinate-plot-root"
      opacity={object.style.opacity}
      rotation={object.rotation}
      scaleX={object.scale.x}
      scaleY={object.scale.y}
      visible={object.visible}
      x={object.position.x}
      y={object.position.y}
    >
      <Rect fill={fill} height={height} width={width} />
      <Group clipHeight={height} clipWidth={width} clipX={0} clipY={0}>
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
        {visibleSeries.flatMap((series) => {
          const result = resultBySeriesId.get(series.id);
          if (result?.sample === null || result?.sample === undefined) return [];
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
          {visibleSeries.map((series, index) => {
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
        </Group>
      )}
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
