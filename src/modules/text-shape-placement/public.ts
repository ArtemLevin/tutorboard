export {
  createTextShapeContourPointCommand,
  createTextShapeGroupTransformCommand,
} from "./figure-actions";
export {
  normalizeTextShapeQuery,
  textShapeCatalog,
  type TextShapeDefinition,
  type TextShapeTemplate,
} from "./catalog";
export { resolveTextShape, suggestTextShapes } from "./parametric-3d";
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
  inspectTextShapeVertexNearPoint,
  type TextShapeFigureContext,
  type TextShapeVertexContext,
  type VertexConstructionKind,
} from "./vertex-constructions";
