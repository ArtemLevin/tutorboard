import type { BoardGroup } from "./groups";
import type { GeometryImportRecord } from "./geometry-imports";
import type {
  BoardObjectId,
  DocumentId,
  GeometryImportId,
  GroupId,
} from "./identifiers";
import type { BoardObject } from "./objects";
import { defaultViewport, type ViewportState } from "./primitives";
import { isIsoTimestamp } from "./timestamps";

export const boardDocumentSchemaVersion = "1.1" as const;

export interface BoardDocument {
  readonly createdAt: string;
  readonly geometryImports: Readonly<
    Partial<Record<GeometryImportId, GeometryImportRecord>>
  >;
  readonly groups: Readonly<Partial<Record<GroupId, BoardGroup>>>;
  readonly id: DocumentId;
  readonly objects: Readonly<Partial<Record<BoardObjectId, BoardObject>>>;
  readonly order: readonly BoardObjectId[];
  readonly schemaVersion: typeof boardDocumentSchemaVersion;
  readonly title: string;
  readonly updatedAt: string;
  readonly viewport: ViewportState;
}

export interface CreateBoardDocumentInput {
  readonly createdAt: string;
  readonly id: DocumentId;
  readonly title: string;
}

export function createEmptyBoardDocument(
  input: CreateBoardDocumentInput,
): BoardDocument {
  if (input.title.length === 0 || input.title.length > 256) {
    throw new RangeError("Board document title must contain 1–256 characters.");
  }

  if (!isIsoTimestamp(input.createdAt)) {
    throw new TypeError(
      "Board document creation time must be an ISO timestamp.",
    );
  }

  return {
    schemaVersion: boardDocumentSchemaVersion,
    id: input.id,
    title: input.title,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    viewport: defaultViewport,
    objects: {},
    order: [],
    groups: {},
    geometryImports: {},
  };
}
