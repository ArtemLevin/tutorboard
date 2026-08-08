import { boardDocumentSchemaVersion, type BoardDocument } from "./document";
import { createVectorInkDataFromPoints } from "./vector-ink";
import {
  boardDocumentSchema01,
  boardDocumentSchema02,
  boardDocumentSchema10,
  boardDocumentSchema11,
  boardDocumentSchema12,
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

function legacyShape(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return raw;
  const legacy = { ...(raw as Record<string, unknown>) };
  delete legacy.solidModels;
  return legacy;
}

export function migrateBoardDocument12To13(
  raw: unknown,
): BoardDocumentMigrationResult {
  const parsed = boardDocumentSchema12.safeParse(legacyShape(raw));
  if (!parsed.success)
    return { ok: false, issues: schemaIssues(parsed.error.issues) };
  const validation = validateBoardDocument({
    ...parsed.data,
    schemaVersion: boardDocumentSchemaVersion,
    solidModels: {},
  });
  return validation.valid
    ? { ok: true, document: validation.document }
    : { ok: false, issues: validation.issues };
}

export function migrateBoardDocument11To13(
  raw: unknown,
): BoardDocumentMigrationResult {
  const parsed = boardDocumentSchema11.safeParse(legacyShape(raw));
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
  return migrateBoardDocument12To13({
    ...parsed.data,
    objects,
    schemaVersion: "1.2" as const,
  });
}

export function migrateBoardDocument10To12(
  raw: unknown,
): BoardDocumentMigrationResult {
  const parsed = boardDocumentSchema10.safeParse(legacyShape(raw));
  if (!parsed.success) {
    return { ok: false, issues: schemaIssues(parsed.error.issues) };
  }
  return migrateBoardDocument11To13({
    ...parsed.data,
    schemaVersion: "1.1" as const,
  });
}

export const migrateBoardDocument11To12 = migrateBoardDocument11To13;

export function migrateBoardDocument02To12(
  raw: unknown,
): BoardDocumentMigrationResult {
  const parsed = boardDocumentSchema02.safeParse(legacyShape(raw));
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
  const parsed = boardDocumentSchema01.safeParse(legacyShape(raw));
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
