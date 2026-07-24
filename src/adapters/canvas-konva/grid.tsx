import { Fragment } from "react";
import { Line } from "react-konva";

import { screenToWorld, type ViewportState } from "../../core/public";

interface CanvasSize {
  readonly height: number;
  readonly width: number;
}

interface GridProps {
  readonly size: CanvasSize;
  readonly viewport: ViewportState;
}

interface GridLine {
  readonly coordinate: number;
  readonly major: boolean;
}

function visibleGridLines(
  start: number,
  end: number,
  spacing: number,
): readonly GridLine[] {
  const first = Math.floor(start / spacing);
  const last = Math.ceil(end / spacing);
  const lines: GridLine[] = [];

  for (let index = first; index <= last; index += 1) {
    lines.push({
      coordinate: index * spacing,
      major: index % 5 === 0,
    });
  }

  return lines;
}

function adaptiveSpacing(zoom: number): number {
  let spacing = 32;
  while (spacing * zoom < 22) {
    spacing *= 2;
  }
  while (spacing * zoom > 88 && spacing > 8) {
    spacing /= 2;
  }
  return spacing;
}

export function BoardGrid({ size, viewport }: GridProps) {
  const topLeft = screenToWorld({ x: 0, y: 0 }, viewport);
  const bottomRight = screenToWorld(
    { x: size.width, y: size.height },
    viewport,
  );
  const spacing = adaptiveSpacing(viewport.zoom);
  const vertical = visibleGridLines(topLeft.x, bottomRight.x, spacing);
  const horizontal = visibleGridLines(topLeft.y, bottomRight.y, spacing);

  return (
    <>
      {vertical.map(({ coordinate, major }) => (
        <Line
          key={`vertical-${coordinate}`}
          listening={false}
          opacity={major ? 0.38 : 0.18}
          points={[coordinate, topLeft.y, coordinate, bottomRight.y]}
          stroke="#7f91a6"
          strokeWidth={(major ? 1.2 : 0.8) / viewport.zoom}
        />
      ))}
      {horizontal.map(({ coordinate, major }) => (
        <Line
          key={`horizontal-${coordinate}`}
          listening={false}
          opacity={major ? 0.38 : 0.18}
          points={[topLeft.x, coordinate, bottomRight.x, coordinate]}
          stroke="#7f91a6"
          strokeWidth={(major ? 1.2 : 0.8) / viewport.zoom}
        />
      ))}
      <Fragment>
        <Line
          listening={false}
          points={[topLeft.x, 0, bottomRight.x, 0]}
          stroke="#d36161"
          strokeWidth={1.5 / viewport.zoom}
        />
        <Line
          listening={false}
          points={[0, topLeft.y, 0, bottomRight.y]}
          stroke="#5a8fd8"
          strokeWidth={1.5 / viewport.zoom}
        />
      </Fragment>
    </>
  );
}
