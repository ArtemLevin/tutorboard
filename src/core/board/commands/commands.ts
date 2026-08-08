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
  Solid3DId,
  SolidLearningAttemptId,
} from "../identifiers";
import type { BoardObject } from "../objects";
import type { Transform2D, Vec2, ViewportState } from "../primitives";
import type { Solid3DRecord } from "../../solid-3d/definitions";
import type {
  Solid3DLearningAttempt,
  SolidLearningAttemptAction,
} from "../../solid-3d-learning/types";

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

export interface SetGroupTransformCommand extends CommandMetadata {
  readonly groupId: GroupId;
  readonly kind: "core.groups.set-transform";
  readonly transform: Transform2D;
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
  readonly solidModels?: readonly Solid3DRecord[];
}

export interface CreateSolid3DCommand extends CommandMetadata {
  readonly kind: "core.solid-3d.create";
  readonly model: Solid3DRecord;
  readonly group: BoardGroup;
  readonly objects: readonly BoardObject[];
}

export interface UpdateSolid3DCommand extends CommandMetadata {
  readonly expected: Solid3DRecord;
  readonly kind: "core.solid-3d.update";
  readonly replacement: Solid3DRecord;
  readonly solidId: Solid3DId;
}

export interface ProjectSolid3DSectionCommand extends CommandMetadata {
  readonly group: BoardGroup;
  readonly kind: "core.solid-3d.project-section";
  readonly objects: readonly BoardObject[];
  readonly sectionId: string;
  readonly solidId: Solid3DId;
}

export interface StartSolid3DLearningCommand extends CommandMetadata {
  readonly attempt: Solid3DLearningAttempt;
  readonly kind: "core.solid-3d-learning.start";
}

export interface ActSolid3DLearningCommand extends CommandMetadata {
  readonly action: SolidLearningAttemptAction;
  readonly attemptId: SolidLearningAttemptId;
  readonly expectedRevision: number;
  readonly kind: "core.solid-3d-learning.act";
}

export interface ResetSolid3DLearningCommand extends CommandMetadata {
  readonly attemptId: SolidLearningAttemptId;
  readonly expectedRevision: number;
  readonly kind: "core.solid-3d-learning.reset";
}

export interface CompleteSolid3DLearningCommand extends CommandMetadata {
  readonly attemptId: SolidLearningAttemptId;
  readonly expectedRevision: number;
  readonly kind: "core.solid-3d-learning.complete";
}

export interface RemoveSolid3DLearningCommand extends CommandMetadata {
  readonly attemptId: SolidLearningAttemptId;
  readonly expectedRevision: number;
  readonly kind: "core.solid-3d-learning.remove";
}

export interface CutContentCommand extends CommandMetadata {
  readonly geometryImportIds: readonly GeometryImportId[];
  readonly groupIds: readonly GroupId[];
  readonly kind: "core.clipboard.cut";
  readonly objectIds: readonly BoardObjectId[];
  readonly solidIds?: readonly Solid3DId[];
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
  | SetGroupTransformCommand
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
  | SetViewportCommand
  | CreateSolid3DCommand
  | UpdateSolid3DCommand
  | ProjectSolid3DSectionCommand
  | StartSolid3DLearningCommand
  | ActSolid3DLearningCommand
  | ResetSolid3DLearningCommand
  | CompleteSolid3DLearningCommand
  | RemoveSolid3DLearningCommand;

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
  "core.groups.set-transform",
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
  "core.solid-3d.create",
  "core.solid-3d.update",
  "core.solid-3d.project-section",
  "core.solid-3d-learning.start",
  "core.solid-3d-learning.act",
  "core.solid-3d-learning.reset",
  "core.solid-3d-learning.complete",
  "core.solid-3d-learning.remove",
] as const satisfies readonly BoardCommand["kind"][];
