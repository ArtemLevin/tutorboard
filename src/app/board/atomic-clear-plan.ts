import type {
  BoardCommand,
  BoardDocument,
  BoardObjectId,
  CommandMetadata,
  GeometryImportId,
  GroupId,
  Solid3DId,
} from "../../core/public";
import {
  maximumBoardCommandJsonBytes,
  maximumBoardCommandTargets,
  serializeBoardCommand,
} from "../../core/board/commands/codec/public";

type Cut = Extract<BoardCommand, { readonly kind: "core.clipboard.cut" }>;

const maximumAtomicClearCommands = 100;
const maximumAtomicClearBytes = 40 * 1024 * 1024;
const envelopeAllowancePerCommand = 2_048;
const maximumConservativeCommandBytes =
  maximumBoardCommandJsonBytes - envelopeAllowancePerCommand;

interface CutMembers {
  objectIds: BoardObjectId[];
  groupIds: GroupId[];
  geometryImportIds: GeometryImportId[];
  solidIds: Solid3DId[];
}

function emptyMembers(): CutMembers {
  return { objectIds: [], groupIds: [], geometryImportIds: [], solidIds: [] };
}

function combine(left: CutMembers, right: CutMembers): CutMembers {
  return {
    objectIds: [...left.objectIds, ...right.objectIds],
    groupIds: [...left.groupIds, ...right.groupIds],
    geometryImportIds: [...left.geometryImportIds, ...right.geometryImportIds],
    solidIds: [...left.solidIds, ...right.solidIds],
  };
}

function cut(members: CutMembers, metadata: CommandMetadata): Cut {
  return { ...metadata, ...members, kind: "core.clipboard.cut" };
}

function serializedBytes(command: Cut): number | null {
  const serialized = serializeBoardCommand(command);
  if (!serialized.ok) return null;
  const bytes = new TextEncoder().encode(serialized.json).byteLength;
  return bytes <= maximumBoardCommandJsonBytes ? bytes : null;
}

/** Local clear does not need to materialize or deep-copy clipboard content. */
export function createFullBoardCut(
  document: BoardDocument,
  metadata: CommandMetadata,
): Cut {
  return cut(
    {
      objectIds: [...document.order],
      groupIds: Object.keys(document.groups) as GroupId[],
      geometryImportIds: Object.keys(
        document.geometryImports,
      ) as GeometryImportId[],
      solidIds: Object.keys(document.solidModels) as Solid3DId[],
    },
    metadata,
  );
}

/**
 * Plan a full clear in transportable, dependency-complete cut commands.
 * Every intermediate document must remain valid. The caller commits the
 * commands as ONE atomic local transition and ONE durable sync batch.
 * Return null before mutation if even one connected component cannot fit.
 */
export function planAtomicFullBoardClear(
  document: BoardDocument,
  metadata: () => CommandMetadata,
): readonly Cut[] | null {
  const ids = document.order;
  if (ids.length === 0) return [];
  const index = new Map(ids.map((id, i) => [id, i] as const));
  if (index.size !== ids.length) return null;
  const parent = ids.map((_, i) => i);
  const root = (i: number): number => {
    let current = i;
    while (parent[current] !== current) current = parent[current]!;
    while (parent[i] !== current) {
      const next = parent[i]!;
      parent[i] = current;
      i = next;
    }
    return current;
  };
  const join = (left: number, right: number) => {
    const a = root(left);
    const b = root(right);
    if (a !== b) parent[b] = a;
  };
  const link = (members: readonly BoardObjectId[]): boolean => {
    if (members.length === 0) return false;
    const first = index.get(members[0]!);
    if (first === undefined) return false;
    for (const id of members) {
      const position = index.get(id);
      if (position === undefined) return false;
      join(first, position);
    }
    return true;
  };

  for (const group of Object.values(document.groups)) {
    if (group === undefined) continue;
    if (!link(group.objectIds)) return null;
  }
  for (const record of Object.values(document.geometryImports)) {
    if (record === undefined) continue;
    if (!link(record.boardObjectIds)) return null;
  }
  for (const record of Object.values(document.solidModels)) {
    if (record === undefined) continue;
    if (!link(record.boardObjectIds)) return null;
  }

  const components = new Map<number, CutMembers>();
  for (let i = 0; i < ids.length; i++) {
    const component = root(i);
    let members = components.get(component);
    if (members === undefined) {
      members = emptyMembers();
      components.set(component, members);
    }
    members.objectIds.push(ids[i]!);
  }
  const componentFor = (
    members: readonly BoardObjectId[],
  ): CutMembers | null => {
    const first = members[0];
    const position = first === undefined ? undefined : index.get(first);
    return position === undefined
      ? null
      : (components.get(root(position)) ?? null);
  };
  for (const group of Object.values(document.groups)) {
    if (group === undefined) continue;
    const members = componentFor(group.objectIds);
    if (members === null) return null;
    members.groupIds.push(group.id);
  }
  for (const record of Object.values(document.geometryImports)) {
    if (record === undefined) continue;
    const members = componentFor(record.boardObjectIds);
    if (members === null) return null;
    members.geometryImportIds.push(record.id);
  }
  for (const record of Object.values(document.solidModels)) {
    if (record === undefined) continue;
    const members = componentFor(record.boardObjectIds);
    if (members === null) return null;
    members.solidIds.push(record.id);
  }

  const encoder = new TextEncoder();
  const componentBytes = (members: CutMembers): number =>
    [
      members.objectIds,
      members.groupIds,
      members.geometryImportIds,
      members.solidIds,
    ].reduce(
      (total, ids) =>
        total +
        ids.reduce(
          (bytes, id) =>
            bytes + encoder.encode(JSON.stringify(id)).byteLength + 1,
          0,
        ),
      0,
    );
  const commands: Cut[] = [];
  let pending = emptyMembers();
  let pendingBytes = 0;
  let totalBytes = 0;
  const flush = (): boolean => {
    if (pending.objectIds.length === 0) return true;
    const command = cut(pending, metadata());
    const bytes = serializedBytes(command);
    if (bytes === null) return false;
    totalBytes += bytes + envelopeAllowancePerCommand;
    if (totalBytes > maximumAtomicClearBytes) return false;
    commands.push(command);
    pending = emptyMembers();
    pendingBytes = 0;
    return commands.length <= maximumAtomicClearCommands;
  };
  for (const component of components.values()) {
    const bytes = componentBytes(component);
    if (
      component.objectIds.length > maximumBoardCommandTargets ||
      bytes > maximumConservativeCommandBytes
    ) {
      return null;
    }
    if (
      pending.objectIds.length > 0 &&
      (pending.objectIds.length + component.objectIds.length >
        maximumBoardCommandTargets ||
        pendingBytes + bytes > maximumConservativeCommandBytes)
    ) {
      if (!flush()) return null;
    }
    pending = combine(pending, component);
    pendingBytes += bytes;
  }
  if (!flush()) return null;
  return commands;
}
