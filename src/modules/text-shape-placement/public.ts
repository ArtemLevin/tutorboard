export {
  normalizeTextShapeQuery,
  resolveTextShape,
  suggestTextShapes,
  textShapeCatalog,
  type TextShapeDefinition,
  type TextShapeTemplate,
} from "./catalog";
export {
  createTextShapePlacementCommand,
  textShapeIdentityFromGroupId,
  textShapeLabelNameFromObjectId,
  textShapeVertexNameFromObjectId,
  type TextShapeIdentity,
} from "./templates";
export {
  createVertexConstructionCommand,
  inspectTextShapeFigure,
  inspectTextShapeVertex,
  type TextShapeFigureContext,
  type TextShapeVertexContext,
  type VertexConstructionKind,
} from "./vertex-constructions";
