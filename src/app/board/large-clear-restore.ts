import { commandId, type BoardCommand } from "../../core/public";
import {
  maximumBoardCommandJsonBytes,
  maximumBoardCommandObjects,
  serializeBoardCommand,
} from "../../core/board/commands/codec/public";

type Paste = Extract<BoardCommand, { kind: "core.clipboard.paste" }>;
type Graph = Extract<BoardCommand, { kind: "core.clipboard.restore-graph" }>;

/** One complete dependency graph is validated and committed as one revision. */
export function planVersionedGraphRestore(paste: Paste): Graph | null {
  if (paste.objects.length < 1 || paste.objects.length > 10_000) return null;
  const graph: Graph = {
    ...paste,
    graphVersion: "1.0",
    kind: "core.clipboard.restore-graph",
  };
  const encoded = serializeBoardCommand(graph);
  if (!encoded.ok) return null;
  return new TextEncoder().encode(encoded.json).byteLength <= 40 * 1024 * 1024
    ? graph
    : null;
}

// Multipart transport stages up to 48 MiB, while preserving the existing
// 100-command, 2 MiB-command and per-list validation bounds. Conservatively
// budget 40 MiB for the complete canonical envelope and metadata.
const maximumAtomicRestoreBytes = 40 * 1024 * 1024;
const maximumAtomicRestoreCommands = 100;
const maximumRestoreChunkBytes = 1_750_000;
const envelopeAllowancePerCommand = 2_048;

interface RestorePart {
  objects: Paste["objects"][number][];
  groups: Paste["groups"][number][];
  geometryImports: Paste["geometryImports"][number][];
  solidModels: NonNullable<Paste["solidModels"]>[number][];
}

function partSize(part: RestorePart, encoder: TextEncoder): number {
  const encoded = (item: unknown) =>
    encoder.encode(JSON.stringify(item)).byteLength + 1;
  return (
    part.objects.reduce((sum, item) => sum + encoded(item), 0) +
    part.groups.reduce((sum, item) => sum + encoded(item), 0) +
    part.geometryImports.reduce((sum, item) => sum + encoded(item), 0) +
    part.solidModels.reduce((sum, item) => sum + encoded(item), 0)
  );
}

function emptyPart(): RestorePart {
  return { objects: [], groups: [], geometryImports: [], solidModels: [] };
}

/**
 * Split only at complete dependency boundaries. Each intermediate paste must
 * be a valid BoardDocument, including group/import/solid ownership. The whole
 * group is then durably enqueued and published as ONE server revision.
 *
 * Returns null when no atomic representation fits the existing protocol.
 * Never fall back to sequential, independently visible restore revisions.
 */
export function planAtomicClearRestore(paste: Paste): readonly Paste[] | null {
  if (paste.objects.length < 1) return null;
  const index = new Map<string, number>(
    paste.objects.map((object, i) => [object.id, i] as const),
  );
  if (index.size !== paste.objects.length) return null;

  const last = paste.objects.map((_, i) => i);
  const mark = (ids: readonly string[]): boolean => {
    if (ids.length === 0) return false;
    const positions = ids.map((id) => index.get(id));
    if (positions.some((value) => value === undefined)) return false;
    const positionsChecked = positions.filter(
      (value): value is number => value !== undefined,
    );
    const start = Math.min(...positionsChecked);
    const end = Math.max(...positionsChecked);
    last[start] = Math.max(last[start] ?? start, end);
    return true;
  };
  for (const group of paste.groups) {
    if (!mark(group.objectIds)) return null;
  }
  for (const record of paste.geometryImports) {
    if (!mark(record.boardObjectIds)) return null;
  }
  for (const record of paste.solidModels ?? []) {
    if (!mark(record.boardObjectIds)) return null;
  }
  const components: RestorePart[] = [];
  let start = 0;
  let end = 0;
  const fromRange = (begin: number, finish: number): RestorePart => {
    const belongs = (ids: readonly string[]) =>
      ids.some((id) => {
        const position = index.get(id);
        return (
          position !== undefined && position >= begin && position <= finish
        );
      });
    const groups = paste.groups.filter((group) => belongs(group.objectIds));
    const groupIds = new Set(groups.map((group) => group.id));
    return {
      objects: paste.objects.slice(begin, finish + 1),
      groups,
      geometryImports: paste.geometryImports.filter((record) =>
        groupIds.has(record.rootGroupId),
      ),
      solidModels: (paste.solidModels ?? []).filter((record) =>
        groupIds.has(record.rootGroupId),
      ),
    };
  };
  for (let i = 0; i < paste.objects.length; i++) {
    end = Math.max(end, last[i] ?? i);
    if (i !== end) continue;
    components.push(fromRange(start, i));
    start = i + 1;
  }
  if (start !== paste.objects.length) return null;

  const encoder = new TextEncoder();
  const chunks: RestorePart[] = [];
  let chunk = emptyPart();
  let size = 0;
  const flush = () => {
    if (chunk.objects.length === 0) return;
    chunks.push(chunk);
    chunk = emptyPart();
    size = 0;
  };
  for (const component of components) {
    const bytes = partSize(component, encoder);
    if (
      bytes > maximumRestoreChunkBytes ||
      component.objects.length > maximumBoardCommandObjects
    )
      return null;
    if (
      chunk.objects.length > 0 &&
      (size + bytes > maximumRestoreChunkBytes ||
        chunk.objects.length + component.objects.length >
          maximumBoardCommandObjects)
    )
      flush();
    chunk.objects.push(...component.objects);
    chunk.groups.push(...component.groups);
    chunk.geometryImports.push(...component.geometryImports);
    chunk.solidModels.push(...component.solidModels);
    size += bytes;
  }
  flush();
  if (chunks.length < 2 || chunks.length > maximumAtomicRestoreCommands)
    return null;

  const result: Paste[] = [];
  let total = 0;
  for (let i = 0; i < chunks.length; i++) {
    const part = chunks[i]!;
    const candidate: Paste = {
      ...paste,
      id: commandId(`${paste.id}:part:${i + 1}`),
      objects: part.objects,
      groups: part.groups,
      geometryImports: part.geometryImports,
      ...(part.solidModels.length === 0
        ? {}
        : { solidModels: part.solidModels }),
    };
    const serialized = serializeBoardCommand(candidate);
    if (!serialized.ok) return null;
    const bytes = encoder.encode(serialized.json).byteLength;
    if (bytes > maximumBoardCommandJsonBytes) return null;
    total += bytes + envelopeAllowancePerCommand;
    if (total > maximumAtomicRestoreBytes) return null;
    result.push(candidate);
  }
  // No group/import/solid may have been omitted by the split.
  if (
    result.reduce((sum, command) => sum + command.groups.length, 0) !==
      paste.groups.length ||
    result.reduce((sum, command) => sum + command.geometryImports.length, 0) !==
      paste.geometryImports.length ||
    result.reduce(
      (sum, command) => sum + (command.solidModels?.length ?? 0),
      0,
    ) !== (paste.solidModels?.length ?? 0)
  )
    return null;
  return result;
}
