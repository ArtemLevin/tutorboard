import { validateCoordinatePlotDefinition } from "../coordinate-plot";
import type { BoardDocument } from "../document";
import type { BoardGroup } from "../groups";
import type { GeometryImportRecord } from "../geometry-imports";
import type { BoardObjectId } from "../identifiers";
import type { BoardObject } from "../objects";
import { ownValue } from "../records";
import { boardDocumentSchema } from "./schema";

export interface ValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly path: string;
}

export type BoardDocumentValidation =
  | {
      readonly document: BoardDocument;
      readonly valid: true;
    }
  | {
      readonly issues: readonly ValidationIssue[];
      readonly valid: false;
    };

function issue(code: string, path: string, message: string): ValidationIssue {
  return { code, path, message };
}

function duplicateValues(values: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    } else {
      seen.add(value);
    }
  }

  return [...duplicates].sort();
}

function validateRecordIdentity(
  recordName: string,
  record: Readonly<Record<string, { readonly id: string } | undefined>>,
): readonly ValidationIssue[] {
  return Object.entries(record).flatMap(([key, value]) => {
    if (value === undefined || value.id === key) {
      return [];
    }

    return [
      issue(
        `document.${recordName}-key-mismatch`,
        `${recordName}.${key}.id`,
        `${recordName} record key must equal the embedded ID.`,
      ),
    ];
  });
}

function validateOrder(document: BoardDocument): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const duplicates = duplicateValues(document.order);

  for (const id of duplicates) {
    issues.push(
      issue(
        "document.order-duplicate",
        "order",
        `Document order contains duplicate ID ${id}.`,
      ),
    );
  }

  const objectIds = Object.keys(document.objects);
  const ordered = new Set(document.order);

  for (const id of document.order) {
    if (ownValue(document.objects, id) === undefined) {
      issues.push(
        issue(
          "document.order-missing-object",
          "order",
          `Document order references missing object ${id}.`,
        ),
      );
    }
  }

  for (const id of objectIds) {
    if (!ordered.has(id as BoardObjectId)) {
      issues.push(
        issue(
          "document.object-missing-from-order",
          `objects.${id}`,
          `Object ${id} is absent from document order.`,
        ),
      );
    }
  }

  return issues;
}

function definedGroups(document: BoardDocument): readonly BoardGroup[] {
  return Object.values(document.groups).filter(
    (group): group is BoardGroup => group !== undefined,
  );
}

function definedObjects(document: BoardDocument): readonly BoardObject[] {
  return Object.values(document.objects).filter(
    (object): object is BoardObject => object !== undefined,
  );
}

function definedImports(
  document: BoardDocument,
): readonly GeometryImportRecord[] {
  return Object.values(document.geometryImports).filter(
    (record): record is GeometryImportRecord => record !== undefined,
  );
}

function validateGroups(document: BoardDocument): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const memberships = new Map<string, string>();

  for (const group of definedGroups(document)) {
    for (const duplicate of duplicateValues(group.objectIds)) {
      issues.push(
        issue(
          "document.group-duplicate-object",
          `groups.${group.id}.objectIds`,
          `Group ${group.id} contains duplicate object ${duplicate}.`,
        ),
      );
    }

    for (const objectId of group.objectIds) {
      const object = ownValue(document.objects, objectId);
      if (object === undefined) {
        issues.push(
          issue(
            "document.group-missing-object",
            `groups.${group.id}.objectIds`,
            `Group ${group.id} references missing object ${objectId}.`,
          ),
        );
        continue;
      }

      const previousGroup = memberships.get(objectId);
      if (previousGroup !== undefined && previousGroup !== group.id) {
        issues.push(
          issue(
            "document.object-in-multiple-groups",
            `groups.${group.id}.objectIds`,
            `Object ${objectId} belongs to multiple groups.`,
          ),
        );
      }
      memberships.set(objectId, group.id);

      if (object.groupId !== group.id) {
        issues.push(
          issue(
            "document.group-back-reference-mismatch",
            `objects.${objectId}.groupId`,
            `Object ${objectId} does not reference group ${group.id}.`,
          ),
        );
      }
    }
  }

  for (const object of definedObjects(document)) {
    if (object.groupId === null) {
      if (memberships.has(object.id)) {
        issues.push(
          issue(
            "document.object-group-reference-missing",
            `objects.${object.id}.groupId`,
            `Object ${object.id} is listed in a group without a back-reference.`,
          ),
        );
      }
      continue;
    }

    const group = ownValue(document.groups, object.groupId);
    if (group === undefined || !group.objectIds.includes(object.id)) {
      issues.push(
        issue(
          "document.object-group-reference-invalid",
          `objects.${object.id}.groupId`,
          `Object ${object.id} references an absent or inconsistent group.`,
        ),
      );
    }
  }

  return issues;
}

function validateGeometryImports(
  document: BoardDocument,
): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const record of definedImports(document)) {
    const importedIds = new Set(record.boardObjectIds);
    const mappedIds = new Set<string>();

    for (const duplicate of duplicateValues(record.boardObjectIds)) {
      issues.push(
        issue(
          "document.import-duplicate-object",
          `geometryImports.${record.id}.boardObjectIds`,
          `Geometry import ${record.id} contains duplicate object ${duplicate}.`,
        ),
      );
    }

    const rootGroup = ownValue(document.groups, record.rootGroupId);
    if (rootGroup === undefined) {
      issues.push(
        issue(
          "document.import-root-group-missing",
          `geometryImports.${record.id}.rootGroupId`,
          `Geometry import ${record.id} references a missing root group.`,
        ),
      );
    } else if (
      rootGroup.transform.rotation !== 0 ||
      rootGroup.transform.scale.x !== 1 ||
      rootGroup.transform.scale.y !== 1 ||
      rootGroup.transform.translation.x !== 0 ||
      rootGroup.transform.translation.y !== 0
    ) {
      issues.push(
        issue(
          "document.import-root-group-transform-not-identity",
          `groups.${rootGroup.id}.transform`,
          `Geometry import ${record.id} owns placement through visualTransform.`,
        ),
      );
    }

    for (const objectId of record.boardObjectIds) {
      const object = ownValue(document.objects, objectId);
      if (object === undefined) {
        issues.push(
          issue(
            "document.import-object-missing",
            `geometryImports.${record.id}.boardObjectIds`,
            `Geometry import ${record.id} references missing object ${objectId}.`,
          ),
        );
      } else if (
        object.source.kind !== "geometryos" ||
        object.source.importId !== record.id
      ) {
        issues.push(
          issue(
            "document.import-source-mismatch",
            `objects.${objectId}.source`,
            `Object ${objectId} does not reference geometry import ${record.id}.`,
          ),
        );
      }
    }

    if (
      rootGroup !== undefined &&
      (rootGroup.objectIds.length !== importedIds.size ||
        rootGroup.objectIds.some((id) => !importedIds.has(id)))
    ) {
      issues.push(
        issue(
          "document.import-group-mismatch",
          `geometryImports.${record.id}.rootGroupId`,
          `Geometry import ${record.id} and its root group contain different objects.`,
        ),
      );
    }

    for (const [girEntityId, objectIds] of Object.entries(record.mapping)) {
      for (const duplicate of duplicateValues(objectIds)) {
        issues.push(
          issue(
            "document.import-mapping-duplicate-object",
            `geometryImports.${record.id}.mapping.${girEntityId}`,
            `Geometry mapping contains duplicate object ${duplicate}.`,
          ),
        );
      }

      for (const objectId of objectIds) {
        mappedIds.add(objectId);
        if (!importedIds.has(objectId)) {
          issues.push(
            issue(
              "document.import-mapping-object-invalid",
              `geometryImports.${record.id}.mapping.${girEntityId}`,
              `Geometry mapping references object outside import ${record.id}.`,
            ),
          );
          continue;
        }
      }
    }

    for (const objectId of importedIds) {
      if (!mappedIds.has(objectId)) {
        issues.push(
          issue(
            "document.import-object-unmapped",
            `geometryImports.${record.id}.mapping`,
            `Imported object ${objectId} has no GIR entity mapping.`,
          ),
        );
      }
      const object = ownValue(document.objects, objectId);
      if (
        object?.source.kind === "geometryos" &&
        !record.mapping[object.source.girEntityId]?.includes(objectId)
      ) {
        issues.push(
          issue(
            "document.import-mapping-source-mismatch",
            `geometryImports.${record.id}.mapping.${object.source.girEntityId}`,
            `Geometry mapping omits the primary source for ${objectId}.`,
          ),
        );
      }
    }

    for (const objectId of Object.keys(record.visualOverrides)) {
      if (!importedIds.has(objectId as BoardObjectId)) {
        issues.push(
          issue(
            "document.import-override-object-invalid",
            `geometryImports.${record.id}.visualOverrides.${objectId}`,
            `Visual override references object outside import ${record.id}.`,
          ),
        );
      }
    }
  }

  for (const object of definedObjects(document)) {
    if (object.source.kind !== "geometryos") {
      continue;
    }

    const record = ownValue(document.geometryImports, object.source.importId);
    if (record === undefined) {
      issues.push(
        issue(
          "document.object-import-reference-invalid",
          `objects.${object.id}.source.importId`,
          `Object ${object.id} references a missing geometry import.`,
        ),
      );
    } else if (!record.boardObjectIds.includes(object.id)) {
      issues.push(
        issue(
          "document.object-import-membership-invalid",
          `objects.${object.id}.source.importId`,
          `Object ${object.id} is absent from its geometry import record.`,
        ),
      );
    }
  }

  return issues;
}

function validateCoordinatePlots(
  document: BoardDocument,
): readonly ValidationIssue[] {
  return definedObjects(document).flatMap((object) => {
    if (object.kind !== "math.coordinate-plot") return [];
    return validateCoordinatePlotDefinition(object.definition).map((item) =>
      issue(
        item.code,
        `objects.${object.id}.definition.${item.path}`,
        item.message,
      ),
    );
  });
}

function validateTimestamps(
  document: BoardDocument,
): readonly ValidationIssue[] {
  if (Date.parse(document.updatedAt) >= Date.parse(document.createdAt)) {
    return [];
  }

  return [
    issue(
      "document.updated-before-created",
      "updatedAt",
      "Document update time precedes creation time.",
    ),
  ];
}

function mapSchemaIssues(
  issues: readonly {
    readonly code: string;
    readonly message: string;
    readonly path: readonly PropertyKey[];
  }[],
): readonly ValidationIssue[] {
  return issues.map((item) =>
    issue(`schema.${item.code}`, item.path.map(String).join("."), item.message),
  );
}

export function validateBoardDocument(input: unknown): BoardDocumentValidation {
  const parsed = boardDocumentSchema.safeParse(input);
  if (!parsed.success) {
    return { valid: false, issues: mapSchemaIssues(parsed.error.issues) };
  }

  const document = parsed.data as BoardDocument;
  const issues = [
    ...validateRecordIdentity("objects", document.objects),
    ...validateRecordIdentity("groups", document.groups),
    ...validateRecordIdentity("geometryImports", document.geometryImports),
    ...validateOrder(document),
    ...validateGroups(document),
    ...validateGeometryImports(document),
    ...validateCoordinatePlots(document),
    ...validateTimestamps(document),
  ];

  return issues.length === 0
    ? { valid: true, document }
    : { valid: false, issues };
}
