import type { CoordinatePlotDefinition } from "../coordinate-plot";
import type { BoardGroup } from "../groups";
import type {
  GeometryImportRecord,
  VisualStyleOverride,
} from "../geometry-imports";
import type {
  ActorId,
  BoardObjectId,
  CommandId,
  GeometryImportId,
  GroupId,
} from "../identifiers";
import type { BoardObject } from "../objects";
import type { Vec2, ViewportState } from "../primitives";

export interface CommandMetadata {
  readonly actorId: ActorId;
  readonly id: CommandId;
  readonly timestamp: string;
}

export interface AddObjectsCommand extends CommandMetadata {
  readonly atIndex?: number;
  readonly kind: "core.objects.add";
  readonly objects: readonly BoardObject[];
}

export interface ReplaceObjectsCommand extends CommandMetadata {
  readonly kind: "core.objects.replace";
  readonly originals: readonly BoardObject[];
  readonly replacements: readonly BoardObject[];
}

export interface AddGroupCommand extends CommandMetadata {
  readonly group: BoardGroup;
  readonly kind: "core.groups.add";
}

export interface RemoveGroupsCommand extends CommandMetadata {
  readonly groupIds: readonly GroupId[];
  readonly kind: "core.groups.remove";
}

export interface ImportGeometryCommand extends CommandMetadata {
  readonly group: BoardGroup;
  readonly importRecord: GeometryImportRecord;
  readonly kind: "core.geometry.import";
  readonly objects: readonly BoardObject[];
}

export interface TranslateGeometryImportCommand extends CommandMetadata {
  readonly delta: Vec2;
  readonly importId: GeometryImportId;
  readonly kind: "core.geometry.translate";
}

export interface OffsetGeometryLabelCommand extends CommandMetadata {
  readonly delta: Vec2;
  readonly importId: GeometryImportId;
  readonly kind: "core.geometry.label-offset";
  readonly objectId: BoardObjectId;
}

export interface SetGeometryVisualStyleCommand extends CommandMetadata {
  readonly importId: GeometryImportId;
  readonly kind: "core.geometry.style-override";
  readonly objectId: BoardObjectId;
  readonly style: VisualStyleOverride;
}

export interface MoveObjectsCommand extends CommandMetadata {
  readonly delta: Vec2;
  readonly kind: "core.objects.move";
  readonly objectIds: readonly BoardObjectId[];
}

export interface MoveGroupCommand extends CommandMetadata {
  readonly delta: Vec2;
  readonly groupId: GroupId;
  readonly kind: "core.groups.move";
}

export interface DeleteObjectsCommand extends CommandMetadata {
  readonly kind: "core.objects.delete";
  readonly objectIds: readonly BoardObjectId[];
}

export interface PasteContentCommand extends CommandMetadata {
  readonly geometryImports: readonly GeometryImportRecord[];
  readonly groups: readonly BoardGroup[];
  readonly kind: "core.clipboard.paste";
  readonly objects: readonly BoardObject[];
}

export interface CutContentCommand extends CommandMetadata {
  readonly geometryImportIds: readonly GeometryImportId[];
  readonly groupIds: readonly GroupId[];
  readonly kind: "core.clipboard.cut";
  readonly objectIds: readonly BoardObjectId[];
}

export interface MoveSelectionCommand extends CommandMetadata {
  readonly delta: Vec2;
  readonly groupIds: readonly GroupId[];
  readonly kind: "core.selection.move";
  readonly objectIds: readonly BoardObjectId[];
}

export interface SetSelectionLockCommand extends CommandMetadata {
  readonly groupIds: readonly GroupId[];
  readonly kind: "core.selection.set-lock";
  readonly locked: boolean;
  readonly objectIds: readonly BoardObjectId[];
}

export interface SetSelectionStyleCommand extends CommandMetadata {
  readonly kind: "core.selection.set-style";
  readonly objectIds: readonly BoardObjectId[];
  readonly style: VisualStyleOverride;
}

export type LayerReorderMode = "back" | "backward" | "forward" | "front";

export interface ReorderLayersCommand extends CommandMetadata {
  readonly kind: "core.layers.reorder";
  readonly mode: LayerReorderMode;
  readonly objectIds: readonly BoardObjectId[];
}

export interface SetLayerVisibilityCommand extends CommandMetadata {
  readonly kind: "core.layers.set-visibility";
  readonly objectIds: readonly BoardObjectId[];
  readonly visible: boolean;
}

export interface SetViewportCommand extends CommandMetadata {
  readonly kind: "core.viewport.set";
  readonly viewport: ViewportState;
}

export interface RenameDocumentCommand extends CommandMetadata {
  readonly kind: "core.document.rename";
  readonly title: string;
}

export interface UpdateTextCommand extends CommandMetadata {
  readonly kind: "core.text.update";
  readonly objectId: BoardObjectId;
  readonly text: string;
}

export interface UpdateCoordinatePlotCommand extends CommandMetadata {
  readonly expected: CoordinatePlotDefinition;
  readonly kind: "core.coordinate-plot.update";
  readonly objectId: BoardObjectId;
  readonly replacement: CoordinatePlotDefinition;
}

export type BoardCommand =
  | AddGroupCommand
  | AddObjectsCommand
  | CutContentCommand
  | DeleteObjectsCommand
  | ImportGeometryCommand
  | OffsetGeometryLabelCommand
  | MoveGroupCommand
  | MoveObjectsCommand
  | MoveSelectionCommand
  | PasteContentCommand
  | ReplaceObjectsCommand
  | RemoveGroupsCommand
  | RenameDocumentCommand
  | ReorderLayersCommand
  | SetGeometryVisualStyleCommand
  | SetSelectionLockCommand
  | SetSelectionStyleCommand
  | SetLayerVisibilityCommand
  | TranslateGeometryImportCommand
  | UpdateCoordinatePlotCommand
  | UpdateTextCommand
  | SetViewportCommand;

export const boardCommandKinds = [
  "core.objects.add",
  "core.objects.replace",
  "core.clipboard.cut",
  "core.clipboard.paste",
  "core.groups.add",
  "core.groups.remove",
  "core.geometry.import",
  "core.geometry.translate",
  "core.geometry.label-offset",
  "core.geometry.style-override",
  "core.objects.move",
  "core.groups.move",
  "core.objects.delete",
  "core.layers.reorder",
  "core.layers.set-visibility",
  "core.selection.move",
  "core.selection.set-lock",
  "core.selection.set-style",
  "core.viewport.set",
  "core.document.rename",
  "core.text.update",
  "core.coordinate-plot.update",
] as const satisfies readonly BoardCommand["kind"][];
