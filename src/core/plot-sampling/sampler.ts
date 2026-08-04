import type { Size2, Vec2 } from "../board/primitives";
import {
  evaluatePlotExpression,
  type PlotEvaluationResult,
  type PlotEvaluationUndefinedReason,
} from "../plot-expression/public";
import { clipPlotEdgeToPixelRect } from "./clipping";
import {
  plotDataToLocalPoint,
  plotLocalPointIsFinite,
  plotPixelSizeIsValid,
  plotViewportIsValid,
} from "./coordinates";
import {
  defaultAdaptiveTolerancePixels,
  defaultInitialIntervalPixels,
  defaultMaximumSegmentPixels,
  defaultMinimumInitialIntervals,
  maximumAdaptiveSamplingDepth,
  maximumInitialSamplingIntervals,
  maximumSamplePointsPerSeries,
  maximumSamplingEvaluationsPerSeries,
} from "./limits";
import type {
  ExplicitPlotSamplingInput,
  ParametricPlotSamplingInput,
  PlotDataBounds,
  PlotSamplingOptions,
  PlotSamplingStopReason,
  SampledPlotSeries,
} from "./types";

interface ResolvedSamplingOptions {
  readonly initialIntervals: number;
  readonly maximumDepth: number;
  readonly maximumEvaluations: number;
  readonly maximumSegmentPixels: number;
  readonly pointLimit: number;
  readonly tolerancePixels: number;
}

interface EvaluatedPoint {
  readonly data: Vec2;
  readonly local: Vec2;
  readonly parameter: number;
}

type EvaluationOutcome =
  | { readonly kind: "gap"; readonly reason: PlotEvaluationUndefinedReason }
  | { readonly kind: "point"; readonly point: EvaluatedPoint };

interface SamplingState {
  breakCount: number;
  clippedEdgeCount: number;
  currentSegment: Vec2[];
  dataBounds: PlotDataBounds | null;
  evaluationCount: number;
  missingBindings: Set<string>;
  pointCount: number;
  refinementCount: number;
  segments: Vec2[][];
  stopReason: PlotSamplingStopReason | null;
  undefinedCounts: Record<PlotEvaluationUndefinedReason, number>;
}

interface RefinementContext {
  readonly boardZoom: number;
  readonly discontinuityJumpPixels: number;
  readonly mode: "explicit" | "parametric";
  readonly options: ResolvedSamplingOptions;
  readonly pixelSize: Size2;
  readonly state: SamplingState;
}

type PointEvaluator = (parameter: number) => EvaluationOutcome;

type DataEvaluation =
  | { readonly kind: "explicit"; readonly result: PlotEvaluationResult }
  | {
      readonly kind: "parametric";
      readonly x: PlotEvaluationResult;
      readonly y: PlotEvaluationResult;
    };

function blankSample(
  stopReason: PlotSamplingStopReason | null = null,
): SampledPlotSeries {
  return {
    dataBounds: null,
    fillPolygons: [],
    metrics: {
      breakCount: 0,
      clippedEdgeCount: 0,
      evaluationCount: 0,
      pointCount: 0,
      refinementCount: 0,
      undefinedCounts: {
        "division-by-zero": 0,
        domain: 0,
        "non-finite": 0,
      },
    },
    missingBindings: [],
    segments: [],
    stopReason,
    truncated: stopReason !== null,
  };
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Math.floor(value)));
}

function clampNumber(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function resolveOptions(
  options: PlotSamplingOptions | undefined,
  pixelSize: Size2,
  boardZoom: number,
): ResolvedSamplingOptions {
  const automaticIntervals = Math.ceil(
    (Math.max(pixelSize.width, pixelSize.height) * boardZoom) /
      defaultInitialIntervalPixels,
  );
  return {
    initialIntervals: clampInteger(
      options?.initialIntervals ?? automaticIntervals,
      defaultMinimumInitialIntervals,
      maximumInitialSamplingIntervals,
    ),
    maximumDepth: clampInteger(
      options?.maximumDepth ?? maximumAdaptiveSamplingDepth,
      0,
      maximumAdaptiveSamplingDepth,
    ),
    maximumEvaluations: clampInteger(
      options?.maximumEvaluations ?? maximumSamplingEvaluationsPerSeries,
      1,
      maximumSamplingEvaluationsPerSeries,
    ),
    maximumSegmentPixels: clampNumber(
      options?.maximumSegmentPixels ?? defaultMaximumSegmentPixels,
      4,
      512,
    ),
    pointLimit: clampInteger(
      options?.pointLimit ?? maximumSamplePointsPerSeries,
      2,
      maximumSamplePointsPerSeries,
    ),
    tolerancePixels: clampNumber(
      options?.tolerancePixels ?? defaultAdaptiveTolerancePixels,
      0.1,
      8,
    ),
  };
}

function createState(): SamplingState {
  return {
    breakCount: 0,
    clippedEdgeCount: 0,
    currentSegment: [],
    dataBounds: null,
    evaluationCount: 0,
    missingBindings: new Set<string>(),
    pointCount: 0,
    refinementCount: 0,
    segments: [],
    stopReason: null,
    undefinedCounts: {
      "division-by-zero": 0,
      domain: 0,
      "non-finite": 0,
    },
  };
}

function stopSampling(
  state: SamplingState,
  reason: PlotSamplingStopReason,
): void {
  state.stopReason ??= reason;
}

function updateDataBounds(state: SamplingState, point: Vec2): void {
  const bounds = state.dataBounds;
  state.dataBounds =
    bounds === null
      ? { xMax: point.x, xMin: point.x, yMax: point.y, yMin: point.y }
      : {
          xMax: Math.max(bounds.xMax, point.x),
          xMin: Math.min(bounds.xMin, point.x),
          yMax: Math.max(bounds.yMax, point.y),
          yMin: Math.min(bounds.yMin, point.y),
        };
}

function pointsEqual(left: Vec2, right: Vec2): boolean {
  return (
    Math.abs(left.x - right.x) <= 1e-9 && Math.abs(left.y - right.y) <= 1e-9
  );
}

function flushSegment(state: SamplingState): void {
  if (state.currentSegment.length >= 2) {
    state.segments.push(state.currentSegment);
  }
  state.currentSegment = [];
}

function breakPath(state: SamplingState): void {
  if (state.currentSegment.length > 0) {
    flushSegment(state);
    state.breakCount += 1;
  }
}

function appendPoint(
  state: SamplingState,
  point: Vec2,
  pointLimit: number,
): boolean {
  const previous = state.currentSegment.at(-1);
  if (previous !== undefined && pointsEqual(previous, point)) return true;
  if (state.pointCount >= pointLimit) {
    stopSampling(state, "point-limit");
    return false;
  }
  state.currentSegment.push(point);
  state.pointCount += 1;
  return true;
}

function emitEdge(
  context: RefinementContext,
  start: EvaluatedPoint,
  end: EvaluatedPoint,
): void {
  const { state } = context;
  if (state.stopReason !== null) return;
  const clipped = clipPlotEdgeToPixelRect(
    start.local,
    end.local,
    context.pixelSize,
  );
  if (clipped === null) {
    breakPath(state);
    return;
  }
  state.clippedEdgeCount += 1;
  const previous = state.currentSegment.at(-1);
  if (previous === undefined || !pointsEqual(previous, clipped.start)) {
    flushSegment(state);
    if (!appendPoint(state, clipped.start, context.options.pointLimit)) return;
  }
  appendPoint(state, clipped.end, context.options.pointLimit);
}

function screenDistance(left: Vec2, right: Vec2, zoom: number): number {
  return Math.hypot(left.x - right.x, left.y - right.y) * zoom;
}

function midpointDeviation(
  start: Vec2,
  middle: Vec2,
  end: Vec2,
  zoom: number,
): number {
  return (
    Math.hypot(
      middle.x - (start.x + end.x) / 2,
      middle.y - (start.y + end.y) / 2,
    ) * zoom
  );
}

function turnAngle(start: Vec2, middle: Vec2, end: Vec2): number {
  const leftX = middle.x - start.x;
  const leftY = middle.y - start.y;
  const rightX = end.x - middle.x;
  const rightY = end.y - middle.y;
  const leftLength = Math.hypot(leftX, leftY);
  const rightLength = Math.hypot(rightX, rightY);
  if (leftLength <= 1e-12 || rightLength <= 1e-12) return Math.PI;
  const cosine = Math.max(
    -1,
    Math.min(1, (leftX * rightX + leftY * rightY) / (leftLength * rightLength)),
  );
  return Math.acos(cosine);
}

function pointIsFarOutside(point: Vec2, pixelSize: Size2): boolean {
  return (
    point.x < -pixelSize.width * 4 ||
    point.x > pixelSize.width * 5 ||
    point.y < -pixelSize.height * 4 ||
    point.y > pixelSize.height * 5
  );
}

function shouldSplitPoints(
  context: RefinementContext,
  start: EvaluatedPoint,
  middle: EvaluatedPoint,
  end: EvaluatedPoint,
): boolean {
  const deviation = midpointDeviation(
    start.local,
    middle.local,
    end.local,
    context.boardZoom,
  );
  const chordLength = screenDistance(start.local, end.local, context.boardZoom);
  if (deviation > context.options.tolerancePixels) return true;
  if (chordLength > context.options.maximumSegmentPixels) return true;
  if (context.mode === "parametric") {
    const leftLength = screenDistance(
      start.local,
      middle.local,
      context.boardZoom,
    );
    const rightLength = screenDistance(
      middle.local,
      end.local,
      context.boardZoom,
    );
    if (
      turnAngle(start.local, middle.local, end.local) > Math.PI / 9 &&
      leftLength + rightLength > 4
    ) {
      return true;
    }
    if (
      chordLength < (leftLength + rightLength) * 0.3 &&
      leftLength + rightLength > 8
    ) {
      return true;
    }
  }
  return false;
}

function leafLooksDiscontinuous(
  context: RefinementContext,
  start: EvaluatedPoint,
  middle: EvaluatedPoint,
  end: EvaluatedPoint,
): boolean {
  const jump = screenDistance(start.local, end.local, context.boardZoom);
  if (jump <= context.discontinuityJumpPixels) return false;
  const deviation = midpointDeviation(
    start.local,
    middle.local,
    end.local,
    context.boardZoom,
  );
  const extremeDeviation = Math.max(
    context.options.tolerancePixels * 12,
    context.discontinuityJumpPixels * 0.2,
  );
  return (
    deviation > extremeDeviation ||
    (pointIsFarOutside(middle.local, context.pixelSize) &&
      pointIsFarOutside(start.local, context.pixelSize) &&
      pointIsFarOutside(end.local, context.pixelSize))
  );
}

function canBisect(start: number, end: number): boolean {
  const middle = start + (end - start) / 2;
  return middle !== start && middle !== end && Number.isFinite(middle);
}

function refineInterval(
  context: RefinementContext,
  evaluate: PointEvaluator,
  startParameter: number,
  endParameter: number,
  start: EvaluationOutcome,
  end: EvaluationOutcome,
  depth: number,
): void {
  const { state } = context;
  if (state.stopReason !== null) return;
  const middleParameter = startParameter + (endParameter - startParameter) / 2;
  const middle = evaluate(middleParameter);
  if (state.stopReason !== null) return;

  const allPoints =
    start.kind === "point" && middle.kind === "point" && end.kind === "point";
  const allGaps =
    start.kind === "gap" && middle.kind === "gap" && end.kind === "gap";
  const mayRefine =
    depth < context.options.maximumDepth &&
    canBisect(startParameter, endParameter);

  if (
    mayRefine &&
    (!allPoints ||
      shouldSplitPoints(context, start.point, middle.point, end.point)) &&
    !allGaps
  ) {
    state.refinementCount += 1;
    refineInterval(
      context,
      evaluate,
      startParameter,
      middleParameter,
      start,
      middle,
      depth + 1,
    );
    refineInterval(
      context,
      evaluate,
      middleParameter,
      endParameter,
      middle,
      end,
      depth + 1,
    );
    return;
  }

  if (
    allPoints &&
    !leafLooksDiscontinuous(context, start.point, middle.point, end.point)
  ) {
    emitEdge(context, start.point, end.point);
  } else {
    breakPath(state);
  }
}

function evaluationKey(value: number): string {
  return Object.is(value, -0) ? "0" : value.toPrecision(17);
}

function createPointEvaluator(input: {
  readonly evaluateDataPoint: (parameter: number) => DataEvaluation;
  readonly independentName: "t" | "x";
  readonly maximumEvaluations: number;
  readonly pixelSize: Size2;
  readonly signal: { readonly aborted: boolean } | undefined;
  readonly state: SamplingState;
  readonly viewport: {
    readonly xMax: number;
    readonly xMin: number;
    readonly yMax: number;
    readonly yMin: number;
  };
}): PointEvaluator {
  const cache = new Map<string, EvaluationOutcome>();
  return (parameter) => {
    const key = evaluationKey(parameter);
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    if (input.signal?.aborted === true) {
      stopSampling(input.state, "aborted");
      return { kind: "gap", reason: "domain" };
    }
    if (input.state.evaluationCount >= input.maximumEvaluations) {
      stopSampling(input.state, "evaluation-limit");
      return { kind: "gap", reason: "domain" };
    }
    input.state.evaluationCount += 1;
    const evaluated = input.evaluateDataPoint(parameter);
    const results: readonly PlotEvaluationResult[] =
      evaluated.kind === "explicit"
        ? [evaluated.result]
        : [evaluated.x, evaluated.y];
    for (const result of results) {
      if (result.kind === "budget-exceeded") {
        stopSampling(input.state, "expression-budget");
        return { kind: "gap", reason: "domain" };
      }
      if (result.kind === "missing-bindings") {
        result.names.forEach((name) => input.state.missingBindings.add(name));
        stopSampling(input.state, "missing-bindings");
        return { kind: "gap", reason: "domain" };
      }
      if (result.kind === "undefined") {
        input.state.undefinedCounts[result.reason] += 1;
        const outcome: EvaluationOutcome = {
          kind: "gap",
          reason: result.reason,
        };
        cache.set(key, outcome);
        return outcome;
      }
    }

    const first = results[0];
    const second = results[1];
    if (first?.kind !== "value") {
      stopSampling(input.state, "expression-budget");
      return { kind: "gap", reason: "domain" };
    }
    const data =
      input.independentName === "x"
        ? { x: parameter, y: first.value }
        : second?.kind === "value"
          ? { x: first.value, y: second.value }
          : null;
    if (data === null) {
      stopSampling(input.state, "expression-budget");
      return { kind: "gap", reason: "domain" };
    }
    const local = plotDataToLocalPoint(data, input.viewport, input.pixelSize);
    if (!plotLocalPointIsFinite(local)) {
      input.state.undefinedCounts["non-finite"] += 1;
      const outcome: EvaluationOutcome = {
        kind: "gap",
        reason: "non-finite",
      };
      cache.set(key, outcome);
      return outcome;
    }
    updateDataBounds(input.state, data);
    const outcome: EvaluationOutcome = {
      kind: "point",
      point: { data, local, parameter },
    };
    cache.set(key, outcome);
    return outcome;
  };
}

function finalizeSample(state: SamplingState): SampledPlotSeries {
  flushSegment(state);
  return {
    dataBounds: state.dataBounds,
    fillPolygons: [],
    metrics: {
      breakCount: state.breakCount,
      clippedEdgeCount: state.clippedEdgeCount,
      evaluationCount: state.evaluationCount,
      pointCount: state.pointCount,
      refinementCount: state.refinementCount,
      undefinedCounts: { ...state.undefinedCounts },
    },
    missingBindings: [...state.missingBindings].sort(),
    segments: state.segments,
    stopReason: state.stopReason,
    truncated: state.stopReason !== null,
  };
}

function samplingInputIsValid(input: {
  readonly boardZoom: number;
  readonly maximum: number;
  readonly minimum: number;
  readonly pixelSize: Size2;
  readonly viewport: {
    readonly xMax: number;
    readonly xMin: number;
    readonly yMax: number;
    readonly yMin: number;
  };
}): boolean {
  return (
    Number.isFinite(input.boardZoom) &&
    input.boardZoom > 0 &&
    plotPixelSizeIsValid(input.pixelSize) &&
    plotViewportIsValid(input.viewport) &&
    Number.isFinite(input.minimum) &&
    Number.isFinite(input.maximum) &&
    input.minimum < input.maximum
  );
}

function discontinuityJumpPixels(pixelSize: Size2, boardZoom: number): number {
  return Math.max(
    160,
    Math.max(pixelSize.width, pixelSize.height) * boardZoom * 0.8,
  );
}

export function sampleExplicitSeries(
  input: ExplicitPlotSamplingInput,
): SampledPlotSeries {
  if (
    !samplingInputIsValid({
      boardZoom: input.boardZoom,
      maximum: input.domain.max,
      minimum: input.domain.min,
      pixelSize: input.pixelSize,
      viewport: input.viewport,
    })
  ) {
    return blankSample("invalid-input");
  }
  const options = resolveOptions(
    input.options,
    input.pixelSize,
    input.boardZoom,
  );
  const state = createState();
  const context: RefinementContext = {
    boardZoom: input.boardZoom,
    discontinuityJumpPixels: discontinuityJumpPixels(
      input.pixelSize,
      input.boardZoom,
    ),
    mode: "explicit",
    options,
    pixelSize: input.pixelSize,
    state,
  };
  const evaluate = createPointEvaluator({
    evaluateDataPoint: (x) => ({
      kind: "explicit",
      result: evaluatePlotExpression(input.expression, {
        ...input.parameters,
        x,
      }),
    }),
    independentName: "x",
    maximumEvaluations: options.maximumEvaluations,
    pixelSize: input.pixelSize,
    signal: input.signal,
    state,
    viewport: input.viewport,
  });

  const span = input.domain.max - input.domain.min;
  let startParameter = input.domain.min;
  let start = evaluate(startParameter);
  for (let index = 0; index < options.initialIntervals; index += 1) {
    if (state.stopReason !== null) break;
    const endParameter =
      index === options.initialIntervals - 1
        ? input.domain.max
        : input.domain.min + (span * (index + 1)) / options.initialIntervals;
    const end = evaluate(endParameter);
    refineInterval(
      context,
      evaluate,
      startParameter,
      endParameter,
      start,
      end,
      0,
    );
    startParameter = endParameter;
    start = end;
  }
  return finalizeSample(state);
}

export function sampleParametricSeries(
  input: ParametricPlotSamplingInput,
): SampledPlotSeries {
  if (
    !samplingInputIsValid({
      boardZoom: input.boardZoom,
      maximum: input.range.max,
      minimum: input.range.min,
      pixelSize: input.pixelSize,
      viewport: input.viewport,
    })
  ) {
    return blankSample("invalid-input");
  }
  const options = resolveOptions(
    input.options,
    input.pixelSize,
    input.boardZoom,
  );
  const state = createState();
  const context: RefinementContext = {
    boardZoom: input.boardZoom,
    discontinuityJumpPixels: discontinuityJumpPixels(
      input.pixelSize,
      input.boardZoom,
    ),
    mode: "parametric",
    options,
    pixelSize: input.pixelSize,
    state,
  };
  const evaluate = createPointEvaluator({
    evaluateDataPoint: (t) => ({
      kind: "parametric",
      x: evaluatePlotExpression(input.xExpression, { ...input.parameters, t }),
      y: evaluatePlotExpression(input.yExpression, { ...input.parameters, t }),
    }),
    independentName: "t",
    maximumEvaluations: options.maximumEvaluations,
    pixelSize: input.pixelSize,
    signal: input.signal,
    state,
    viewport: input.viewport,
  });

  const span = input.range.max - input.range.min;
  const first = evaluate(input.range.min);
  let startParameter = input.range.min;
  let start = first;
  for (let index = 0; index < options.initialIntervals; index += 1) {
    if (state.stopReason !== null) break;
    const endParameter =
      index === options.initialIntervals - 1
        ? input.range.max
        : input.range.min + (span * (index + 1)) / options.initialIntervals;
    const end = evaluate(endParameter);
    refineInterval(
      context,
      evaluate,
      startParameter,
      endParameter,
      start,
      end,
      0,
    );
    startParameter = endParameter;
    start = end;
  }

  if (
    input.closed &&
    state.stopReason === null &&
    state.breakCount === 0 &&
    first.kind === "point" &&
    start.kind === "point" &&
    screenDistance(first.point.local, start.point.local, input.boardZoom) <=
      context.discontinuityJumpPixels
  ) {
    emitEdge(context, start.point, first.point);
  }
  return finalizeSample(state);
}
