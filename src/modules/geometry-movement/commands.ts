import type {
  BoardObjectId,
  CommandMetadata,
  GeometryImportId,
  OffsetGeometryLabelCommand,
  SetGeometryVisualStyleCommand,
  TranslateGeometryImportCommand,
  Vec2,
  VisualStyleOverride,
} from "../../core/public";

export function createTranslateGeometryImportCommand(
  metadata: CommandMetadata,
  importId: GeometryImportId,
  delta: Vec2,
): TranslateGeometryImportCommand {
  return {
    ...metadata,
    delta,
    importId,
    kind: "core.geometry.translate",
  };
}

export function createOffsetGeometryLabelCommand(
  metadata: CommandMetadata,
  importId: GeometryImportId,
  objectId: BoardObjectId,
  delta: Vec2,
): OffsetGeometryLabelCommand {
  return {
    ...metadata,
    delta,
    importId,
    kind: "core.geometry.label-offset",
    objectId,
  };
}

export function createSetGeometryVisualStyleCommand(
  metadata: CommandMetadata,
  importId: GeometryImportId,
  objectId: BoardObjectId,
  style: VisualStyleOverride,
): SetGeometryVisualStyleCommand {
  return {
    ...metadata,
    importId,
    kind: "core.geometry.style-override",
    objectId,
    style,
  };
}
