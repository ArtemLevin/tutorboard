import type { Vec2 } from "../board/primitives";
import {
  evaluatePlotExpression,
  type PlotEvaluationResult,
  type PlotEvaluationUndefinedReason,
} from "../plot-expression/public";
import {
  maximumSamplePointsPerSeries,
  maximumSamplingEvaluationsPerSeries,
} from "./limits";
import type {
  PlotSamplingStopReason,
  RelationPlotSamplingInput,
  SampledPlotSeries,
} from "./types";

interface RelationSamplingState {
  evaluationCount: number;
  missingBindings: Set<string>;
  stopReason: PlotSamplingStopReason | null;
  undefinedCounts: Record<PlotEvaluationUndefinedReason, number>;
}

type Edge = readonly [Vec2, Vec2];

function integerOption(
  value: number | undefined,
  fallback: number,
  maximum: number,
  minimum: number,
): number {
  return Math.max(
    minimum,
    Math.min(
      maximum,
      Math.floor(
        value !== undefined && Number.isFinite(value) ? value : fallback,
      ),
    ),
  );
}

function evaluate(
  expression: RelationPlotSamplingInput["leftExpression"],
  bindings: Readonly<Record<string, number>>,
  state: RelationSamplingState,
  maximumEvaluations: number,
): PlotEvaluationResult | null {
  if (state.evaluationCount >= maximumEvaluations) {
    state.stopReason = "evaluation-limit";
    return null;
  }
  state.evaluationCount += 1;
  const result = evaluatePlotExpression(expression, bindings);
  if (result.kind === "budget-exceeded") {
    state.stopReason = "expression-budget";
  } else if (result.kind === "missing-bindings") {
    result.names.forEach((name) => state.missingBindings.add(name));
    state.stopReason = "missing-bindings";
  } else if (result.kind === "undefined") {
    state.undefinedCounts[result.reason] += 1;
  }
  return result;
}

function differenceAt(
  input: RelationPlotSamplingInput,
  state: RelationSamplingState,
  maximumEvaluations: number,
  x: number,
  y: number,
): number {
  if (input.signal?.aborted === true) {
    state.stopReason = "aborted";
    return Number.NaN;
  }
  const bindings = { ...input.parameters, x, y };
  const left = evaluate(
    input.leftExpression,
    bindings,
    state,
    maximumEvaluations,
  );
  const right = evaluate(
    input.rightExpression,
    bindings,
    state,
    maximumEvaluations,
  );
  return left?.kind === "value" && right?.kind === "value"
    ? left.value - right.value
    : Number.NaN;
}

function interpolate(
  start: Vec2,
  end: Vec2,
  startValue: number,
  endValue: number,
): Vec2 {
  const denominator = startValue - endValue;
  const progress =
    Math.abs(denominator) <= Number.EPSILON
      ? 0.5
      : Math.max(0, Math.min(1, startValue / denominator));
  return {
    x: start.x + (end.x - start.x) * progress,
    y: start.y + (end.y - start.y) * progress,
  };
}

function contourEdges(input: {
  readonly bottomLeft: Vec2;
  readonly bottomLeftValue: number;
  readonly bottomRight: Vec2;
  readonly bottomRightValue: number;
  readonly topLeft: Vec2;
  readonly topLeftValue: number;
  readonly topRight: Vec2;
  readonly topRightValue: number;
}): readonly Edge[] {
  const values = [
    input.topLeftValue,
    input.topRightValue,
    input.bottomRightValue,
    input.bottomLeftValue,
  ];
  if (values.some((value) => !Number.isFinite(value))) return [];
  const mask = values.reduce(
    (result, value, index) => result | (value >= 0 ? 1 << index : 0),
    0,
  );
  if (mask === 0 || mask === 15) return [];

  const top = interpolate(
    input.topLeft,
    input.topRight,
    input.topLeftValue,
    input.topRightValue,
  );
  const right = interpolate(
    input.topRight,
    input.bottomRight,
    input.topRightValue,
    input.bottomRightValue,
  );
  const bottom = interpolate(
    input.bottomLeft,
    input.bottomRight,
    input.bottomLeftValue,
    input.bottomRightValue,
  );
  const left = interpolate(
    input.topLeft,
    input.bottomLeft,
    input.topLeftValue,
    input.bottomLeftValue,
  );
  const centerPositive =
    values.reduce((sum, value) => sum + value, 0) / values.length >= 0;

  switch (mask) {
    case 1:
    case 14:
      return [[left, top]];
    case 2:
    case 13:
      return [[top, right]];
    case 3:
    case 12:
      return [[left, right]];
    case 4:
    case 11:
      return [[right, bottom]];
    case 5:
      return centerPositive
        ? [
            [top, right],
            [bottom, left],
          ]
        : [
            [left, top],
            [right, bottom],
          ];
    case 6:
    case 9:
      return [[top, bottom]];
    case 7:
    case 8:
      return [[left, bottom]];
    case 10:
      return centerPositive
        ? [
            [left, top],
            [right, bottom],
          ]
        : [
            [top, right],
            [bottom, left],
          ];
    default:
      return [];
  }
}

function pointKey(point: Vec2): string {
  return `${Math.round(point.x * 100_000)}:${Math.round(point.y * 100_000)}`;
}

function stitchEdges(edges: readonly Edge[]): readonly (readonly Vec2[])[] {
  const adjacency = new Map<string, number[]>();
  edges.forEach((edge, index) => {
    for (const point of edge) {
      const key = pointKey(point);
      adjacency.set(key, [...(adjacency.get(key) ?? []), index]);
    }
  });
  const used = new Set<number>();
  const paths: Vec2[][] = [];

  const extend = (path: Vec2[], atStart: boolean) => {
    while (true) {
      const endpoint = atStart ? path[0]! : path.at(-1)!;
      const nextIndex = (adjacency.get(pointKey(endpoint)) ?? []).find(
        (index) => !used.has(index),
      );
      if (nextIndex === undefined) return;
      used.add(nextIndex);
      const edge = edges[nextIndex]!;
      const next = pointKey(edge[0]) === pointKey(endpoint) ? edge[1] : edge[0];
      if (atStart) path.unshift(next);
      else path.push(next);
    }
  };

  edges.forEach((edge, index) => {
    if (used.has(index)) return;
    used.add(index);
    const path = [edge[0], edge[1]];
    extend(path, false);
    extend(path, true);
    paths.push(path);
  });
  return paths;
}

function inequalitySatisfied(
  value: number,
  operator: RelationPlotSamplingInput["operator"],
): boolean {
  if (!Number.isFinite(value) || operator === "=") return false;
  return operator === "<" || operator === "<=" ? value <= 0 : value >= 0;
}

function fillRuns(
  values: readonly (readonly number[])[],
  columns: number,
  rows: number,
  cellWidth: number,
  cellHeight: number,
  operator: RelationPlotSamplingInput["operator"],
): readonly (readonly Vec2[])[] {
  if (operator === "=") return [];
  const complete: Vec2[][] = [];
  let active = new Map<string, Vec2[]>();

  for (let row = 0; row < rows; row += 1) {
    const runs: { readonly end: number; readonly start: number }[] = [];
    let start: number | null = null;
    for (let column = 0; column < columns; column += 1) {
      const corners = [
        values[row]?.[column],
        values[row]?.[column + 1],
        values[row + 1]?.[column],
        values[row + 1]?.[column + 1],
      ];
      const finiteCorners = corners.filter(
        (value): value is number =>
          value !== undefined && Number.isFinite(value),
      );
      const inside =
        finiteCorners.length === 4 &&
        inequalitySatisfied(
          finiteCorners.reduce((sum, value) => sum + value, 0) / 4,
          operator,
        );
      if (inside && start === null) start = column;
      if ((!inside || column === columns - 1) && start !== null) {
        runs.push({ end: inside ? column + 1 : column, start });
        start = null;
      }
    }

    const next = new Map<string, Vec2[]>();
    for (const run of runs) {
      const key = `${run.start}:${run.end}`;
      const previous = active.get(key);
      const x0 = run.start * cellWidth;
      const x1 = run.end * cellWidth;
      const y0 = row * cellHeight;
      const y1 = (row + 1) * cellHeight;
      next.set(
        key,
        previous === undefined
          ? [
              { x: x0, y: y0 },
              { x: x1, y: y0 },
              { x: x1, y: y1 },
              { x: x0, y: y1 },
            ]
          : [previous[0]!, previous[1]!, { x: x1, y: y1 }, { x: x0, y: y1 }],
      );
    }
    for (const [key, polygon] of active) {
      if (!next.has(key)) complete.push(polygon);
    }
    active = next;
  }
  complete.push(...active.values());
  return complete;
}

export function sampleRelationSeries(
  input: RelationPlotSamplingInput,
): SampledPlotSeries {
  const maximumEvaluations = integerOption(
    input.options?.maximumEvaluations,
    maximumSamplingEvaluationsPerSeries,
    maximumSamplingEvaluationsPerSeries,
    2,
  );
  const pointLimit = integerOption(
    input.options?.pointLimit,
    maximumSamplePointsPerSeries,
    maximumSamplePointsPerSeries,
    2,
  );
  const screenWidth = input.pixelSize.width * input.boardZoom;
  const screenHeight = input.pixelSize.height * input.boardZoom;
  const maximumGridPoints = Math.max(4, Math.floor(maximumEvaluations / 2));
  let columns = Math.max(24, Math.min(128, Math.ceil(screenWidth / 7)));
  let rows = Math.max(18, Math.min(96, Math.ceil(screenHeight / 7)));
  const gridPoints = () => (columns + 1) * (rows + 1);
  while (gridPoints() > maximumGridPoints && (columns > 24 || rows > 18)) {
    if (columns / 24 >= rows / 18 && columns > 24) columns -= 1;
    else if (rows > 18) rows -= 1;
  }

  const state: RelationSamplingState = {
    evaluationCount: 0,
    missingBindings: new Set(),
    stopReason: null,
    undefinedCounts: {
      "division-by-zero": 0,
      domain: 0,
      "non-finite": 0,
    },
  };
  const values: number[][] = [];
  const xSpan = input.viewport.xMax - input.viewport.xMin;
  const ySpan = input.viewport.yMax - input.viewport.yMin;
  for (let row = 0; row <= rows && state.stopReason === null; row += 1) {
    const dataY = input.viewport.yMax - (row / rows) * ySpan;
    const valuesRow: number[] = [];
    for (let column = 0; column <= columns; column += 1) {
      const dataX = input.viewport.xMin + (column / columns) * xSpan;
      valuesRow.push(
        differenceAt(input, state, maximumEvaluations, dataX, dataY),
      );
      if (state.stopReason !== null) break;
    }
    values.push(valuesRow);
  }

  if (state.stopReason !== null) {
    return {
      dataBounds: null,
      fillPolygons: [],
      metrics: {
        breakCount: 0,
        clippedEdgeCount: 0,
        evaluationCount: state.evaluationCount,
        pointCount: 0,
        refinementCount: 0,
        undefinedCounts: state.undefinedCounts,
      },
      missingBindings: [...state.missingBindings].sort(),
      segments: [],
      stopReason: state.stopReason,
      truncated: true,
    };
  }

  const cellWidth = input.pixelSize.width / columns;
  const cellHeight = input.pixelSize.height / rows;
  const edges: Edge[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      edges.push(
        ...contourEdges({
          bottomLeft: { x: column * cellWidth, y: (row + 1) * cellHeight },
          bottomLeftValue: values[row + 1]?.[column] ?? Number.NaN,
          bottomRight: {
            x: (column + 1) * cellWidth,
            y: (row + 1) * cellHeight,
          },
          bottomRightValue: values[row + 1]?.[column + 1] ?? Number.NaN,
          topLeft: { x: column * cellWidth, y: row * cellHeight },
          topLeftValue: values[row]?.[column] ?? Number.NaN,
          topRight: { x: (column + 1) * cellWidth, y: row * cellHeight },
          topRightValue: values[row]?.[column + 1] ?? Number.NaN,
        }),
      );
    }
  }

  const rawSegments = stitchEdges(edges);
  const rawFillPolygons = fillRuns(
    values,
    columns,
    rows,
    cellWidth,
    cellHeight,
    input.operator,
  );
  let remaining = pointLimit;
  const segments = rawSegments.filter((segment) => {
    if (segment.length > remaining) return false;
    remaining -= segment.length;
    return true;
  });
  const fillPolygons = rawFillPolygons.filter((polygon) => {
    if (polygon.length > remaining) return false;
    remaining -= polygon.length;
    return true;
  });
  const pointCount = pointLimit - remaining;
  const truncated =
    segments.length < rawSegments.length ||
    fillPolygons.length < rawFillPolygons.length;
  const hasGeometry = segments.length > 0 || fillPolygons.length > 0;
  return {
    dataBounds: hasGeometry ? { ...input.viewport } : null,
    fillPolygons,
    metrics: {
      breakCount: Math.max(0, segments.length - 1),
      clippedEdgeCount: edges.length,
      evaluationCount: state.evaluationCount,
      pointCount,
      refinementCount: 0,
      undefinedCounts: state.undefinedCounts,
    },
    missingBindings: [],
    segments,
    stopReason: truncated ? "point-limit" : null,
    truncated,
  };
}
