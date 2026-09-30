import {
  boardDocument14SchemaVersion,
  boardDocument15SchemaVersion,
  boardDocumentSchemaVersion,
  type BoardDocument,
  type BoardDocument15,
} from "./document";
import { createVectorInkDataFromPoints } from "./vector-ink";
import {
  boardDocumentSchema01,
  boardDocumentSchema02,
  boardDocumentSchema10,
  boardDocumentSchema11,
  boardDocumentSchema12,
  boardDocumentSchema13,
  boardDocumentSchema14,
  boardDocumentSchema15,
} from "./validation/schema";
import {
  validateBoardDocument,
  type ValidationIssue,
} from "./validation/validate";

export type BoardDocumentMigrationResult =
  | { readonly document: BoardDocument; readonly ok: true }
  | { readonly issues: readonly ValidationIssue[]; readonly ok: false };

export type BoardDocument15MigrationResult =
  | { readonly document: BoardDocument15; readonly ok: true }
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
  delete legacy.solidLearningAttempts;
  return legacy;
}

export function migrateBoardDocument12To13(
  raw: unknown,
): BoardDocumentMigrationResult {
  const parsed = boardDocumentSchema12.safeParse(legacyShape(raw));
  if (!parsed.success)
    return { ok: false, issues: schemaIssues(parsed.error.issues) };
  return migrateBoardDocument13To14({
    ...parsed.data,
    schemaVersion: "1.3",
    solidModels: {},
  });
}

export function migrateBoardDocument13To14(
  raw: unknown,
): BoardDocumentMigrationResult {
  const parsed = boardDocumentSchema13.safeParse(raw);
  if (!parsed.success)
    return { ok: false, issues: schemaIssues(parsed.error.issues) };
  return migrateBoardDocument14To16({
    ...parsed.data,
    schemaVersion: boardDocument14SchemaVersion,
    solidLearningAttempts: {},
  });
}

export function migrateBoardDocument14To15(
  raw: unknown,
): BoardDocument15MigrationResult {
  const parsed = boardDocumentSchema14.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, issues: schemaIssues(parsed.error.issues) };
  }

  const next = boardDocumentSchema15.safeParse({
    ...parsed.data,
    schemaVersion: boardDocument15SchemaVersion,
  });
  if (!next.success) {
    return { ok: false, issues: schemaIssues(next.error.issues) };
  }

  const semanticValidation = validateBoardDocument({
    ...next.data,
    schemaVersion: boardDocumentSchemaVersion,
  });
  return semanticValidation.valid
    ? { ok: true, document: next.data as BoardDocument15 }
    : { ok: false, issues: semanticValidation.issues };
}

export function migrateBoardDocument15To16(
  raw: unknown,
): BoardDocumentMigrationResult {
  const parsed = boardDocumentSchema15.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, issues: schemaIssues(parsed.error.issues) };
  }

  const validation = validateBoardDocument({
    ...parsed.data,
    schemaVersion: boardDocumentSchemaVersion,
  });
  return validation.valid
    ? { ok: true, document: validation.document }
    : { ok: false, issues: validation.issues };
}

export function migrateBoardDocument14To16(
  raw: unknown,
): BoardDocumentMigrationResult {
  const migrated = migrateBoardDocument14To15(raw);
  return migrated.ok ? migrateBoardDocument15To16(migrated.document) : migrated;
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

/** @deprecated Compatibility alias retained for historical callers. */
export const migrateBoardDocument01To10 = migrateBoardDocument01To12;
/** @deprecated Compatibility alias retained for historical callers. */
export const migrateBoardDocument01To11 = migrateBoardDocument01To12;
/** @deprecated Compatibility alias retained for historical callers. */
export const migrateBoardDocument02To10 = migrateBoardDocument02To12;
/** @deprecated Compatibility alias retained for historical callers. */
export const migrateBoardDocument02To11 = migrateBoardDocument02To12;
/** @deprecated Compatibility alias retained for historical callers. */
export const migrateBoardDocument10To11 = migrateBoardDocument10To12;
