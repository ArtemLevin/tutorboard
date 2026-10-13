import { z } from "zod";
import type { BoardDocument } from "../document";
import { boardDocumentSchema } from "./schema";
import {
  validateBoardDocument,
  validateDocumentInvariants,
  type BoardDocumentValidation,
} from "./validate";

// Only snapshots cloned/checked here enter this registry. Caller-owned input
// and command payloads are never frozen or trusted by their type alone.
const snapshots = new WeakMap<object, BoardDocument>();
const frozenNodes = new WeakSet<object>();
const records = [
  "objects",
  "groups",
  "geometryImports",
  "solidModels",
  "solidLearningAttempts",
] as const;
const fieldCaches = new Map<string, WeakSet<object>>();
const valueCaches = new Map<string, WeakSet<object>>();

function cacheFor(caches: Map<string, WeakSet<object>>, key: string) {
  let cache = caches.get(key);
  if (cache === undefined) {
    cache = new WeakSet();
    caches.set(key, cache);
  }
  return cache;
}

function reuse<T extends z.ZodType>(schema: T, cache: WeakSet<object>) {
  return z.union([
    z.custom<z.output<T>>(
      (value) =>
        typeof value === "object" && value !== null && cache.has(value),
    ),
    schema,
  ]);
}

const shape = boardDocumentSchema.shape;
const transitionSchema = boardDocumentSchema.extend({
  objects: reuse(
    z.record(
      shape.objects.keyType,
      reuse(shape.objects.valueType, cacheFor(valueCaches, "objects")),
    ),
    cacheFor(fieldCaches, "objects"),
  ),
  groups: reuse(
    z.record(
      shape.groups.keyType,
      reuse(shape.groups.valueType, cacheFor(valueCaches, "groups")),
    ),
    cacheFor(fieldCaches, "groups"),
  ),
  geometryImports: reuse(
    z.record(
      shape.geometryImports.keyType,
      reuse(
        shape.geometryImports.valueType,
        cacheFor(valueCaches, "geometryImports"),
      ),
    ),
    cacheFor(fieldCaches, "geometryImports"),
  ),
  solidModels: reuse(
    z.record(
      shape.solidModels.keyType,
      reuse(shape.solidModels.valueType, cacheFor(valueCaches, "solidModels")),
    ),
    cacheFor(fieldCaches, "solidModels"),
  ),
  solidLearningAttempts: reuse(
    z.record(
      shape.solidLearningAttempts.keyType,
      reuse(
        shape.solidLearningAttempts.valueType,
        cacheFor(valueCaches, "solidLearningAttempts"),
      ),
    ),
    cacheFor(fieldCaches, "solidLearningAttempts"),
  ),
  order: reuse(shape.order, cacheFor(fieldCaches, "order")),
});

function freeze(value: unknown): void {
  if (typeof value !== "object" || value === null || frozenNodes.has(value))
    return;
  for (const child of Object.values(value)) freeze(child);
  Object.freeze(value);
  frozenNodes.add(value);
}

function own(document: BoardDocument): BoardDocument {
  freeze(document);
  snapshots.set(document, document);
  for (const field of records) {
    const record = document[field];
    const fieldCache = cacheFor(fieldCaches, field);
    if (fieldCache.has(record)) continue;
    fieldCache.add(record);
    for (const value of Object.values(record) as unknown[]) {
      if (typeof value === "object" && value !== null)
        cacheFor(valueCaches, field).add(value);
    }
  }
  cacheFor(fieldCaches, "order").add(document.order);
  return document;
}

export function validateBoardDocumentForReduction(
  document: unknown,
): BoardDocumentValidation {
  const snapshot =
    typeof document === "object" && document !== null
      ? snapshots.get(document)
      : undefined;
  if (snapshot !== undefined) return { valid: true, document: snapshot };
  const result = validateBoardDocument(document);
  return result.valid
    ? { valid: true, document: own(result.document) }
    : result;
}

export function validateBoardDocumentTransition(
  document: BoardDocument,
  previous: BoardDocument,
): BoardDocumentValidation {
  if (!snapshots.has(previous))
    return validateBoardDocumentForReduction(document);
  const parsed = transitionSchema.safeParse(document);
  if (!parsed.success)
    return {
      valid: false,
      issues: parsed.error.issues.map((item) => ({
        code: `schema.${item.code}`,
        path: item.path.map(String).join("."),
        message: item.message,
      })),
    };
  const candidate = parsed.data as BoardDocument;
  const issues = validateDocumentInvariants(candidate, previous);
  return issues.length === 0
    ? { valid: true, document: own(candidate) }
    : { valid: false, issues };
}
