import { boardDocumentSchemaVersion, type BoardDocument } from "./document";
import { createVectorInkDataFromPoints } from "./vector-ink";
import {
  boardDocumentSchema01,
  boardDocumentSchema02,
  boardDocumentSchema10,
  boardDocumentSchema11,
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

export function migrateBoardDocument11To12(
  raw: unknown,
): BoardDocumentMigrationResult {
  const parsed = boardDocumentSchema11.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, issues: schemaIssues(parsed.error.issues) };
  }
  const objects = Object.fromEntries(
    Object.entries(parsed.data.objects).map(([id, object]) => [
      id,
      object.kind === "drawing.pen-stroke"
        ? { ...object, ink: createVectorInkDataFromPoints(object.points) }
        : object,
    ]),
  );
  const validation = validateBoardDocument({
    ...parsed.data,
    objects,
    schemaVersion: boardDocumentSchemaVersion,
  });
  return validation.valid
    ? { ok: true, document: validation.document }
    : { ok: false, issues: validation.issues };
}

export function migrateBoardDocument10To12(
  raw: unknown,
): BoardDocumentMigrationResult {
  const parsed = boardDocumentSchema10.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, issues: schemaIssues(parsed.error.issues) };
  }
  return migrateBoardDocument11To12({
    ...parsed.data,
    schemaVersion: "1.1" as const,
  });
}

export function migrateBoardDocument02To12(
  raw: unknown,
): BoardDocumentMigrationResult {
  const parsed = boardDocumentSchema02.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, issues: schemaIssues(parsed.error.issues) };
  }
  return migrateBoardDocument10To12({
    ...parsed.data,
    schemaVersion: "1.0" as const,
  });
}

export function migrateBoardDocument01To12(
  raw: unknown,
): BoardDocumentMigrationResult {
  const parsed = boardDocumentSchema01.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, issues: schemaIssues(parsed.error.issues) };
  }
  return migrateBoardDocument02To12({
    ...parsed.data,
    schemaVersion: "0.2" as const,
  });
}

/** @deprecated Current migrations return BoardDocument 1.2. */
export const migrateBoardDocument01To10 = migrateBoardDocument01To12;
/** @deprecated Current migrations return BoardDocument 1.2. */
export const migrateBoardDocument01To11 = migrateBoardDocument01To12;
/** @deprecated Current migrations return BoardDocument 1.2. */
export const migrateBoardDocument02To10 = migrateBoardDocument02To12;
/** @deprecated Current migrations return BoardDocument 1.2. */
export const migrateBoardDocument02To11 = migrateBoardDocument02To12;
/** @deprecated Current migrations return BoardDocument 1.2. */
export const migrateBoardDocument10To11 = migrateBoardDocument10To12;
