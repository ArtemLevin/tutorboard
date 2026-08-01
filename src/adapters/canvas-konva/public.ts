export const canvasAdapterContractVersion = "1.0" as const;

export {
  BoardStage,
  type BoardObjectTransformSnapshot,
  type BoardSelectionAreaOperation,
  type BoardSelectionBounds,
  type BoardSelectionRect,
  type BoardStageProps,
  type SelectionPointerStartSample,
  type WorldPointerSample,
} from "./BoardStage";
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
  KonvaRendererRegistry,
  type KonvaObjectRenderer,
} from "./renderer-registry";
