export const canvasAdapterContractVersion = "1.0" as const;

export {
  BoardStage,
  type BoardObjectTransformSnapshot,
  type CanvasContextMenuRequest,
  type BoardSelectionAreaOperation,
  type BoardSelectionBounds,
  type BoardSelectionRect,
  type BoardStageProps,
  type SelectionPointerStartSample,
  type WorldPointerSample,
} from "./BoardStage";
export {
  panCoordinatePlotViewport,
  pinchCoordinatePlotViewport,
  zoomCoordinatePlotViewportAt,
  type CoordinatePlotZoomAxis,
} from "./coordinate-plot-editing";
export {
  createCoordinatePlotRenderModel,
  type CoordinatePlotRenderModel,
  type CreateCoordinatePlotRenderModelInput,
} from "./coordinate-plot-render-model";
export {
  CoordinatePlotRenderer,
  type CoordinatePlotRendererProps,
} from "./coordinate-plot-renderer";
export {
  choosePlotGridStep,
  createPlotGridRenderModel,
  createPlotLegendLayout,
  enumeratePlotTicks,
  flattenPlotSegment,
  formatPlotTick,
  plotLineDash,
  resolveCoordinatePlotViewport,
  type PlotGridRenderModel,
  type PlotLegendLayout,
  type PlotRenderTick,
} from "./coordinate-plot-rendering";
export { createDefaultKonvaRendererRegistry } from "./default-renderers";
export {
  collectCoalescedPointerEvents,
  collectPredictedPointerEvents,
  maximumCoalescedPointerEvents,
  maximumPredictedPointerEvents,
  pointerEventInputTimestampMs,
} from "./pointer-samples";
export {
  createKonvaWetInkSurface,
  maximumWetInkActualPoints,
  maximumWetInkPredictedPoints,
  WetInkLatencyTracker,
  WetInkRenderer,
  wetInkLatencyWindowSize,
  type WetInkFrame,
  type WetInkFrameClock,
  type WetInkFrameReport,
  type WetInkLatencySnapshot,
  type WetInkRendererOptions,
  type WetInkSample,
  type WetInkStyle,
  type WetInkSurface,
} from "./wet-ink-renderer";
export {
  KonvaRendererRegistry,
  type CoordinatePlotRenderInteraction,
  type KonvaObjectRenderer,
  type KonvaRenderContext,
} from "./renderer-registry";
