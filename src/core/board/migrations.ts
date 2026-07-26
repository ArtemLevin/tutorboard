import { boardDocumentSchemaVersion, type BoardDocument } from "./document";
import {
  boardDocumentSchema01,
  boardDocumentSchema02,
} from "./validation/schema";
import {
  validateBoardDocument,
  type ValidationIssue,
} from "./validation/validate";

export type BoardDocumentMigrationResult =
  | { readonly document: BoardDocument; readonly ok: true }
  | { readonly issues: readonly ValidationIssue[]; readonly ok: false };

function schemaIssues(
  issues: readonly {
    readonly code: string;
    readonly message: string;
    readonly path: readonly PropertyKey[];
  }[],
): readonly ValidationIssue[] {
  return issues.map((item) => ({
    code: `schema.${item.code}`,
    message: item.message,
    path: item.path.map(String).join("."),
  }));
}

export function migrateBoardDocument01To10(
  raw: unknown,
): BoardDocumentMigrationResult {
  const parsed = boardDocumentSchema01.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, issues: schemaIssues(parsed.error.issues) };
  }

  const migrated = {
    ...parsed.data,
    schemaVersion: "0.2" as const,
  };
  return migrateBoardDocument02To10(migrated);
}

export function migrateBoardDocument02To10(
  raw: unknown,
): BoardDocumentMigrationResult {
  const parsed = boardDocumentSchema02.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, issues: schemaIssues(parsed.error.issues) };
  }

  const migrated = {
    ...parsed.data,
    schemaVersion: boardDocumentSchemaVersion,
  };
  const validation = validateBoardDocument(migrated);
  return validation.valid
    ? { ok: true, document: validation.document }
    : { ok: false, issues: validation.issues };
}
