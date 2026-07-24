import type { BoardGroup } from "../groups";
import type {
  ActorId,
  BoardObjectId,
  CommandId,
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

export interface AddGroupCommand extends CommandMetadata {
  readonly group: BoardGroup;
  readonly kind: "core.groups.add";
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

export interface SetViewportCommand extends CommandMetadata {
  readonly kind: "core.viewport.set";
  readonly viewport: ViewportState;
}

export interface RenameDocumentCommand extends CommandMetadata {
  readonly kind: "core.document.rename";
  readonly title: string;
}

export type BoardCommand =
  | AddGroupCommand
  | AddObjectsCommand
  | DeleteObjectsCommand
  | MoveGroupCommand
  | MoveObjectsCommand
  | MoveSelectionCommand
  | RenameDocumentCommand
  | SetSelectionLockCommand
  | SetViewportCommand;

export const boardCommandKinds = [
  "core.objects.add",
  "core.groups.add",
  "core.objects.move",
  "core.groups.move",
  "core.objects.delete",
  "core.selection.move",
  "core.selection.set-lock",
  "core.viewport.set",
  "core.document.rename",
] as const satisfies readonly BoardCommand["kind"][];
