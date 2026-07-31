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
export { createDefaultKonvaRendererRegistry } from "./default-renderers";
export {
  KonvaRendererRegistry,
  type KonvaObjectRenderer,
} from "./renderer-registry";
