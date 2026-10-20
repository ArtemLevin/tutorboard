import {
  reduceBoardDocument,
  type BoardCommand,
  type BoardDocument,
} from "../../core/public";
import { planAtomicClearRestore } from "./large-clear-restore";
import {
  maximumBoardCommandJsonBytes,
  maximumBoardCommandObjects,
} from "../../core/board/commands/codec/public";

type Cut = Extract<BoardCommand, { kind: "core.clipboard.cut" }>;
type Paste = Extract<BoardCommand, { kind: "core.clipboard.paste" }>;
interface RestoreIds {
  objects: ReadonlySet<string>;
  groups: ReadonlySet<string>;
  imports: ReadonlySet<string>;
  solids: ReadonlySet<string>;
}
function sameIds(
  ids: readonly string[],
  restored: ReadonlySet<string>,
  count: number,
): boolean {
  return (
    ids.length === count &&
    restored.size === count &&
    ids.every((id) => restored.has(id))
  );
}
function restoreIds(cut: Cut, paste: Paste): RestoreIds | null {
  const ids: RestoreIds = {
    objects: new Set(paste.objects.map((item) => item.id)),
    groups: new Set(paste.groups.map((item) => item.id)),
    imports: new Set(paste.geometryImports.map((item) => item.id)),
    solids: new Set((paste.solidModels ?? []).map((item) => item.id)),
  };
  if (
    paste.objects.length === 0 ||
    !sameIds(cut.objectIds, ids.objects, paste.objects.length) ||
    !sameIds(cut.groupIds, ids.groups, paste.groups.length) ||
    !sameIds(
      cut.geometryImportIds,
      ids.imports,
      paste.geometryImports.length,
    ) ||
    !sameIds(cut.solidIds ?? [], ids.solids, paste.solidModels?.length ?? 0) ||
    paste.objects.some(
      (item) =>
        (item.groupId !== null && !ids.groups.has(item.groupId)) ||
        (item.source.kind === "geometryos" &&
          !ids.imports.has(item.source.importId)),
    ) ||
    paste.groups.some((item) =>
      item.objectIds.some((id) => !ids.objects.has(id)),
    ) ||
    paste.geometryImports.some(
      (item) =>
        !ids.groups.has(item.rootGroupId) ||
        item.boardObjectIds.some((id) => !ids.objects.has(id)),
    ) ||
    (paste.solidModels ?? []).some(
      (item) =>
        !ids.groups.has(item.rootGroupId) ||
        item.boardObjectIds.some((id) => !ids.objects.has(id)),
    )
  )
    return null;
  return ids;
}
function collides(
  record: Readonly<Record<string, unknown>>,
  ids: ReadonlySet<string>,
): boolean {
  if (ids.size === 0) return false;
  return Object.keys(record).some(
    (id) => record[id] !== undefined && ids.has(id),
  );
}
export function sameUndoContent(
  left: BoardDocument,
  right: BoardDocument,
): boolean {
  return (
    left.id === right.id &&
    left.schemaVersion === right.schemaVersion &&
    left.objects === right.objects &&
    left.groups === right.groups &&
    left.geometryImports === right.geometryImports &&
    left.solidModels === right.solidModels &&
    left.solidLearningAttempts === right.solidLearningAttempts &&
    left.order === right.order
  );
}

/** Workspace-scoped certificates for inverses generated AFTER successful local
 * cut commits. This is not a validator or authorization boundary for arbitrary
 * clipboard commands. Actual Undo always runs through the sync engine/reducer. */
export class CollaborativeUndoAvailability {
  readonly #restores = new WeakMap<
    readonly BoardCommand[],
    RestoreIds | false
  >();
  registerCommittedCut(
    command: BoardCommand,
    inverse: readonly BoardCommand[],
  ): boolean | undefined {
    if (command.kind !== "core.clipboard.cut" || inverse.length !== 1) return;
    const paste = inverse[0];
    if (paste?.kind !== "core.clipboard.paste") return;
    // Once per generated inverse; never retain this temporary JSON or advertise
    // a restore that cannot survive the existing durable command codec.
    if (
      paste.objects.length > maximumBoardCommandObjects ||
      paste.groups.length > maximumBoardCommandObjects ||
      paste.geometryImports.length > maximumBoardCommandObjects ||
      (paste.solidModels?.length ?? 0) > maximumBoardCommandObjects ||
      new TextEncoder().encode(JSON.stringify(paste)).byteLength >
        maximumBoardCommandJsonBytes
    ) {
      this.#restores.set(inverse, false);
      return false;
    }
    const ids = restoreIds(command, paste);
    if (ids === null) return;
    // The inverse container and arrays were generated locally, not supplied by
    // the caller. Their values come from the validated committed source snapshot.
    Object.freeze(paste.objects);
    Object.freeze(paste.groups);
    Object.freeze(paste.geometryImports);
    if (paste.solidModels !== undefined) Object.freeze(paste.solidModels);
    Object.freeze(paste);
    Object.freeze(inverse);
    this.#restores.set(inverse, ids);
    return true;
  }
  /**
   * Returns a certified, transportable Undo group. Large cuts are split into
   * complete dependency components; the sync engine accepts the whole array
   * via one atomic durable batch. Unrepresentable cuts remain an Undo barrier.
   */
  prepareCommittedCut(
    command: BoardCommand,
    inverse: readonly BoardCommand[],
  ): readonly BoardCommand[] | false | undefined {
    const registered = this.registerCommittedCut(command, inverse);
    if (registered === true) return inverse;
    if (registered === undefined) return undefined;

    const paste = inverse[0];
    if (
      command.kind !== "core.clipboard.cut" ||
      paste?.kind !== "core.clipboard.paste"
    )
      return false;
    const ids = restoreIds(command, paste);
    if (ids === null) return false;
    const commands = planAtomicClearRestore(paste);
    if (commands === null) return false;
    for (const part of commands) {
      Object.freeze(part.objects);
      Object.freeze(part.groups);
      Object.freeze(part.geometryImports);
      if (part.solidModels !== undefined) Object.freeze(part.solidModels);
      Object.freeze(part);
    }
    Object.freeze(commands);
    this.#restores.set(commands, ids);
    return commands;
  }

  stillApplies(
    document: BoardDocument,
    commands: readonly BoardCommand[],
  ): boolean {
    const ids = this.#restores.get(commands);
    if (ids === false) return false;
    if (ids !== undefined)
      return (
        !collides(document.objects, ids.objects) &&
        !collides(document.groups, ids.groups) &&
        !collides(document.geometryImports, ids.imports) &&
        !collides(document.solidModels, ids.solids)
      );
    let preview = document;
    for (const command of commands) {
      const result = reduceBoardDocument(preview, command);
      if (!result.ok) return false;
      preview = result.document;
    }
    return true;
  }
}
