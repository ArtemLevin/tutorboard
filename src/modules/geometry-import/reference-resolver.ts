import type {
  GeometryImportDiagnostic,
  GeometrySemanticReference,
} from "./contract";
import { diagnostic, compareString } from "./diagnostics";
import type { EntityIndexes, ObjectKind } from "./entity-index";
import { geometryImportLimits } from "./limits";

type EntityCategory = "constraint" | "construction-step" | "object";

interface ReferenceCollector {
  readonly items: GeometrySemanticReference[];
  overflow: boolean;
}

const lineLikeKinds = new Set<ObjectKind>(["line", "ray", "segment"]);
const intersectionKinds = new Set<ObjectKind>([
  "circle",
  "line",
  "ray",
  "segment",
]);

function addReference(
  references: ReferenceCollector,
  sourceCategory: EntityCategory,
  sourceId: string,
  role: string,
  targetCategory: "constraint" | "object",
  targetId: string,
): void {
  if (references.items.length >= geometryImportLimits.maxReferences) {
    references.overflow = true;
    return;
  }
  references.items.push({
    sourceCategory,
    sourceId,
    role,
    targetCategory,
    targetId,
  });
}

function requireObject(
  indexes: EntityIndexes,
  diagnostics: GeometryImportDiagnostic[],
  references: ReferenceCollector,
  sourceCategory: EntityCategory,
  sourceId: string,
  role: string,
  targetId: string,
  path: string,
  allowedKinds?: ReadonlySet<ObjectKind>,
): void {
  const target = indexes.objectsById.get(targetId);
  if (target === undefined) {
    diagnostics.push(
      diagnostic("geometry-import.missing-reference", "error", {
        path,
        girEntityId: sourceId,
        relatedGirEntityIds: [targetId],
      }),
    );
    return;
  }
  if (allowedKinds !== undefined && !allowedKinds.has(target.value.type)) {
    diagnostics.push(
      diagnostic("geometry-import.reference-kind-mismatch", "error", {
        path,
        girEntityId: sourceId,
        relatedGirEntityIds: [targetId],
      }),
    );
    return;
  }
  addReference(references, sourceCategory, sourceId, role, "object", targetId);
}

function requireConstraint(
  indexes: EntityIndexes,
  diagnostics: GeometryImportDiagnostic[],
  references: ReferenceCollector,
  sourceId: string,
  role: string,
  targetId: string,
  path: string,
): void {
  if (!indexes.constraintsById.has(targetId)) {
    diagnostics.push(
      diagnostic("geometry-import.missing-reference", "error", {
        path,
        girEntityId: sourceId,
        relatedGirEntityIds: [targetId],
      }),
    );
    return;
  }
  addReference(
    references,
    "construction-step",
    sourceId,
    role,
    "constraint",
    targetId,
  );
}

function requireDistinct(
  values: readonly string[],
  diagnostics: GeometryImportDiagnostic[],
  sourceId: string,
  path: string,
): void {
  if (new Set(values).size !== values.length) {
    diagnostics.push(
      diagnostic("geometry-import.degenerate-reference", "error", {
        path,
        girEntityId: sourceId,
        relatedGirEntityIds: values,
      }),
    );
  }
}

function resolveObjectReferences(
  indexes: EntityIndexes,
  diagnostics: GeometryImportDiagnostic[],
  references: ReferenceCollector,
): void {
  for (const { index, value } of indexes.objectsById.values()) {
    const base = `/objects/${index}`;
    switch (value.type) {
      case "point":
        break;
      case "segment":
      case "line": {
        requireDistinct(value.points, diagnostics, value.id, `${base}/points`);
        value.points.forEach((targetId, targetIndex) =>
          requireObject(
            indexes,
            diagnostics,
            references,
            "object",
            value.id,
            `points[${targetIndex}]`,
            targetId,
            `${base}/points/${targetIndex}`,
            new Set<ObjectKind>(["point"]),
          ),
        );
        break;
      }
      case "ray": {
        requireDistinct(
          [value.start, value.through],
          diagnostics,
          value.id,
          base,
        );
        requireObject(
          indexes,
          diagnostics,
          references,
          "object",
          value.id,
          "start",
          value.start,
          `${base}/start`,
          new Set<ObjectKind>(["point"]),
        );
        requireObject(
          indexes,
          diagnostics,
          references,
          "object",
          value.id,
          "through",
          value.through,
          `${base}/through`,
          new Set<ObjectKind>(["point"]),
        );
        break;
      }
      case "circle":
        requireObject(
          indexes,
          diagnostics,
          references,
          "object",
          value.id,
          "center",
          value.center,
          `${base}/center`,
          new Set<ObjectKind>(["point"]),
        );
        if (value.radius_point !== null && value.radius_point !== undefined) {
          requireObject(
            indexes,
            diagnostics,
            references,
            "object",
            value.id,
            "radius_point",
            value.radius_point,
            `${base}/radius_point`,
            new Set<ObjectKind>(["point"]),
          );
        }
        break;
      case "triangle":
        requireDistinct(
          value.vertices,
          diagnostics,
          value.id,
          `${base}/vertices`,
        );
        value.vertices.forEach((targetId, targetIndex) =>
          requireObject(
            indexes,
            diagnostics,
            references,
            "object",
            value.id,
            `vertices[${targetIndex}]`,
            targetId,
            `${base}/vertices/${targetIndex}`,
            new Set<ObjectKind>(["point"]),
          ),
        );
        break;
      case "angle":
        requireDistinct(value.points, diagnostics, value.id, `${base}/points`);
        value.points.forEach((targetId, targetIndex) =>
          requireObject(
            indexes,
            diagnostics,
            references,
            "object",
            value.id,
            `points[${targetIndex}]`,
            targetId,
            `${base}/points/${targetIndex}`,
            new Set<ObjectKind>(["point"]),
          ),
        );
        break;
      case "label":
        requireObject(
          indexes,
          diagnostics,
          references,
          "object",
          value.id,
          "target",
          value.target,
          `${base}/target`,
        );
        break;
    }
  }
}

function resolveConstraintReferences(
  indexes: EntityIndexes,
  diagnostics: GeometryImportDiagnostic[],
  references: ReferenceCollector,
): void {
  const pointKinds = new Set<ObjectKind>(["point"]);
  const segmentKinds = new Set<ObjectKind>(["segment"]);
  const angleKinds = new Set<ObjectKind>(["angle"]);
  const rayKinds = new Set<ObjectKind>(["ray"]);
  const triangleKinds = new Set<ObjectKind>(["triangle"]);
  const circleKinds = new Set<ObjectKind>(["circle"]);

  for (const { index, value } of indexes.constraintsById.values()) {
    const base = `/constraints/${index}`;
    const object = (
      role: string,
      targetId: string,
      allowedKinds?: ReadonlySet<ObjectKind>,
    ): void =>
      requireObject(
        indexes,
        diagnostics,
        references,
        "constraint",
        value.id,
        role,
        targetId,
        `${base}/${role}`,
        allowedKinds,
      );

    switch (value.type) {
      case "belongs_to":
        object("point", value.point, pointKinds);
        object("object", value.object);
        break;
      case "collinear":
      case "non_collinear":
        requireDistinct(value.points, diagnostics, value.id, `${base}/points`);
        value.points.forEach((targetId, targetIndex) =>
          requireObject(
            indexes,
            diagnostics,
            references,
            "constraint",
            value.id,
            `points[${targetIndex}]`,
            targetId,
            `${base}/points/${targetIndex}`,
            pointKinds,
          ),
        );
        break;
      case "parallel":
      case "perpendicular":
        requireDistinct(
          value.objects,
          diagnostics,
          value.id,
          `${base}/objects`,
        );
        value.objects.forEach((targetId, targetIndex) =>
          requireObject(
            indexes,
            diagnostics,
            references,
            "constraint",
            value.id,
            `objects[${targetIndex}]`,
            targetId,
            `${base}/objects/${targetIndex}`,
            lineLikeKinds,
          ),
        );
        break;
      case "equal_length":
        requireDistinct(
          value.objects,
          diagnostics,
          value.id,
          `${base}/objects`,
        );
        value.objects.forEach((targetId, targetIndex) =>
          requireObject(
            indexes,
            diagnostics,
            references,
            "constraint",
            value.id,
            `objects[${targetIndex}]`,
            targetId,
            `${base}/objects/${targetIndex}`,
            segmentKinds,
          ),
        );
        break;
      case "midpoint":
        object("point", value.point, pointKinds);
        object("object", value.object, segmentKinds);
        break;
      case "intersection":
        object("point", value.point, pointKinds);
        requireDistinct(
          value.objects,
          diagnostics,
          value.id,
          `${base}/objects`,
        );
        value.objects.forEach((targetId, targetIndex) =>
          requireObject(
            indexes,
            diagnostics,
            references,
            "constraint",
            value.id,
            `objects[${targetIndex}]`,
            targetId,
            `${base}/objects/${targetIndex}`,
            intersectionKinds,
          ),
        );
        break;
      case "altitude":
        object("from_point", value.from_point, pointKinds);
        object(
          "to_object",
          value.to_object,
          new Set<ObjectKind>(["line", "segment"]),
        );
        object("foot", value.foot, pointKinds);
        object("segment", value.segment, segmentKinds);
        break;
      case "median":
        object("from_point", value.from_point, pointKinds);
        object("to_object", value.to_object, segmentKinds);
        object("midpoint", value.midpoint, pointKinds);
        object("segment", value.segment, segmentKinds);
        break;
      case "angle_bisector":
        object("angle", value.angle, angleKinds);
        object("ray", value.ray, rayKinds);
        break;
      case "circumcircle":
      case "incircle":
        object("triangle", value.triangle, triangleKinds);
        object("circle", value.circle, circleKinds);
        break;
    }
  }
}

function resolveStepReferences(
  indexes: EntityIndexes,
  diagnostics: GeometryImportDiagnostic[],
  references: ReferenceCollector,
): void {
  for (const { index, value } of indexes.stepsById.values()) {
    value.objects.forEach((targetId, targetIndex) =>
      requireObject(
        indexes,
        diagnostics,
        references,
        "construction-step",
        value.id,
        `objects[${targetIndex}]`,
        targetId,
        `/construction_steps/${index}/objects/${targetIndex}`,
      ),
    );
    (value.constraints ?? []).forEach((targetId, targetIndex) =>
      requireConstraint(
        indexes,
        diagnostics,
        references,
        value.id,
        `constraints[${targetIndex}]`,
        targetId,
        `/construction_steps/${index}/constraints/${targetIndex}`,
      ),
    );
  }
}

export function resolveReferences(
  indexes: EntityIndexes,
  diagnostics: GeometryImportDiagnostic[],
): readonly GeometrySemanticReference[] {
  const references: ReferenceCollector = { items: [], overflow: false };
  resolveObjectReferences(indexes, diagnostics, references);
  resolveConstraintReferences(indexes, diagnostics, references);
  resolveStepReferences(indexes, diagnostics, references);
  if (references.overflow) {
    diagnostics.push(
      diagnostic("geometry-import.complexity-limit-exceeded", "error", {
        path: "/",
      }),
    );
  }
  return references.items.sort(
    (left, right) =>
      compareString(left.sourceCategory, right.sourceCategory) ||
      compareString(left.sourceId, right.sourceId) ||
      compareString(left.role, right.role) ||
      compareString(left.targetCategory, right.targetCategory) ||
      compareString(left.targetId, right.targetId),
  );
}
