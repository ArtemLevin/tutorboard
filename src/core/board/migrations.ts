import { boardDocumentSchemaVersion, type BoardDocument } from "./document";
import {
  boardDocumentSchema01,
  boardDocumentSchema02,
  boardDocumentSchema10,
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

export function migrateBoardDocument10To11(
  raw: unknown,
): BoardDocumentMigrationResult {
  const parsed = boardDocumentSchema10.safeParse(raw);
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

export function migrateBoardDocument02To11(
  raw: unknown,
): BoardDocumentMigrationResult {
  const parsed = boardDocumentSchema02.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, issues: schemaIssues(parsed.error.issues) };
  }
  return migrateBoardDocument10To11({
    ...parsed.data,
    schemaVersion: "1.0" as const,
  });
}

export function migrateBoardDocument01To11(
  raw: unknown,
): BoardDocumentMigrationResult {
  const parsed = boardDocumentSchema01.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, issues: schemaIssues(parsed.error.issues) };
  }
  return migrateBoardDocument02To11({
    ...parsed.data,
    schemaVersion: "0.2" as const,
  });
}

/** @deprecated Use migrateBoardDocument01To11. */
export const migrateBoardDocument01To10 = migrateBoardDocument01To11;
/** @deprecated Use migrateBoardDocument02To11. */
export const migrateBoardDocument02To10 = migrateBoardDocument02To11;
