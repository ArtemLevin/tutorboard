export {
  actorId,
  boardObjectId,
  commandId,
  documentId,
  geometryImportId,
  groupId,
  type ActorId,
  type BoardObjectId,
  type CommandId,
  type DocumentId,
  type GeometryImportId,
  type GroupId,
} from "./board/identifiers";
export {
  boardDocumentSchemaVersion,
  createEmptyBoardDocument,
  type BoardDocument,
  type CreateBoardDocumentInput,
} from "./board/document";
export type { BoardGroup } from "./board/groups";
export type {
  GeometryImportRecord,
  VisualOverride,
} from "./board/geometry-imports";
export {
  boardObjectKinds,
  type BoardObject,
  type BoardObjectKind,
  type BoardObjectSource,
  type EllipseObject,
  type LineObject,
  type ObjectStyle,
  type PenStrokeObject,
  type RectangleObject,
  type TextObject,
} from "./board/objects";
export {
  defaultViewport,
  identityTransform,
  type Size2,
  type Transform2D,
  type Vec2,
  type ViewportState,
} from "./board/primitives";
export {
  panViewport,
  screenToWorld,
  worldToScreen,
  zoomViewportAt,
  type ZoomBounds,
} from "./board/coordinates";
export {
  boardCommandKinds,
  type AddGroupCommand,
  type AddObjectsCommand,
  type BoardCommand,
  type CommandMetadata,
  type DeleteObjectsCommand,
  type MoveGroupCommand,
  type MoveObjectsCommand,
  type RenameDocumentCommand,
  type SetViewportCommand,
} from "./board/commands/commands";
export {
  reduceBoardDocument,
  type CommandError,
  type CommandErrorCode,
  type CommandResult,
} from "./board/commands/reducer";
export {
  selectBoardScene,
  selectGroupObjects,
  selectOrderedObjects,
  type BoardRenderItem,
  type BoardSceneReadModel,
} from "./board/selectors";
export {
  deserializeBoardDocument,
  serializeBoardDocument,
  type BoardDocumentDeserializationResult,
  type BoardDocumentSerializationResult,
} from "./board/serialization/serialization";
export {
  readBoardDocument,
  type BoardDocumentReadResult,
} from "./board/validation/read";
export {
  validateBoardDocument,
  type BoardDocumentValidation,
  type ValidationIssue,
} from "./board/validation/validate";
