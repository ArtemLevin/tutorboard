import type { ReactElement } from "react";
import { Group, Line, Rect, Text } from "react-konva";

import type { CoordinatePlotObject } from "../../core/public";

export interface CoordinatePlotPlaceholderRendererProps {
  readonly object: CoordinatePlotObject;
}

export function CoordinatePlotPlaceholderRenderer({
  object,
}: CoordinatePlotPlaceholderRendererProps): ReactElement {
  const { definition } = object;
  const { height, width } = definition.size;
  const viewport = definition.coordinateViewport;
  const xAxisY =
    viewport.yMin <= 0 && viewport.yMax >= 0
      ? ((viewport.yMax - 0) / (viewport.yMax - viewport.yMin)) * height
      : height / 2;
  const yAxisX =
    viewport.xMin <= 0 && viewport.xMax >= 0
      ? ((0 - viewport.xMin) / (viewport.xMax - viewport.xMin)) * width
      : width / 2;
  const visibleSeries = definition.series.filter(({ visible }) => visible);
  const fill = object.style.fill ?? "#ffffff";
  const stroke = object.style.stroke ?? "#64748b";
  const gridLines = Array.from({ length: 9 }, (_, index) => index + 1);

  return (
    <Group
      name="board-transform-target"
      opacity={object.style.opacity}
      rotation={object.rotation}
      scaleX={object.scale.x}
      scaleY={object.scale.y}
      visible={object.visible}
      x={object.position.x}
      y={object.position.y}
    >
      <Rect
        fill={fill}
        height={height}
        hitStrokeWidth={Math.max(14, object.style.strokeWidth)}
        stroke={stroke}
        strokeWidth={Math.max(1, object.style.strokeWidth)}
        width={width}
      />
      {definition.grid.visible &&
        gridLines.map((index) => (
          <Group key={index} listening={false} opacity={0.16}>
            <Line
              points={[(width * index) / 10, 0, (width * index) / 10, height]}
              stroke={stroke}
              strokeWidth={1}
            />
            <Line
              points={[0, (height * index) / 10, width, (height * index) / 10]}
              stroke={stroke}
              strokeWidth={1}
            />
          </Group>
        ))}
      {definition.axes.showXAxis && (
        <Line
          listening={false}
          points={[0, xAxisY, width, xAxisY]}
          stroke={stroke}
          strokeWidth={1.5}
        />
      )}
      {definition.axes.showYAxis && (
        <Line
          listening={false}
          points={[yAxisX, 0, yAxisX, height]}
          stroke={stroke}
          strokeWidth={1.5}
        />
      )}
      <Text
        fill={stroke}
        fontSize={16}
        fontStyle="bold"
        listening={false}
        text="Координатная плоскость"
        width={Math.max(0, width - 24)}
        x={12}
        y={10}
      />
      <Text
        fill={stroke}
        fontSize={13}
        listening={false}
        text={`${definition.series.length} графиков`}
        x={12}
        y={34}
      />
      {definition.legend.visible && (
        <Text
          align="right"
          fill={stroke}
          fontSize={12}
          listening={false}
          text={visibleSeries.map(({ name }) => name).join("\n")}
          width={Math.max(0, width - 24)}
          x={12}
          y={58}
        />
      )}
    </Group>
  );
}
