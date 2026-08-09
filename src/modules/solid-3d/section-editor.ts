import {
  isSolidSectionHelperPoint,
  materializeSolidSectionConstraint,
  resolveSolid3DPointPosition,
  solidSectionId,
  type Solid3DPoint,
  type Solid3DRecord,
  type SolidSectionConstraint,
  type SolidSectionResult,
} from "../../core/public";
import {
  calculateSolidSection,
  type SolidSectionWorkflowResult,
} from "./section-workflow";

type SolidSectionWorkflowErrorCode =
  SolidSectionWorkflowResult extends infer Result
    ? Result extends { readonly status: "error"; readonly code: infer Code }
      ? Code
      : never
    : never;

export type SolidSectionEditorResult =
  | {
      readonly code: SolidSectionWorkflowErrorCode | "solid.section.limit";
      readonly status: "error";
    }
  | {
      readonly record: Solid3DRecord;
      readonly section: SolidSectionResult;
      readonly sectionId: string;
      readonly status: "ok";
    };

function appendSection(
  record: Solid3DRecord,
  pointIds: readonly [
    Solid3DPoint["id"],
    Solid3DPoint["id"],
    Solid3DPoint["id"],
  ],
  token: string,
): SolidSectionEditorResult {
  const existing = record.sections.find(
    (section) =>
      section.pointIds.length === pointIds.length &&
      section.pointIds.every((id) => pointIds.includes(id)),
  );
  if (existing === undefined && record.sections.length >= 8)
    return { code: "solid.section.limit", status: "error" };

  const calculated = calculateSolidSection(record, pointIds);
  if (calculated.status === "error") return calculated;
  const sectionId =
    existing?.id ?? solidSectionId(`solid-section:explicit:${token}`);
  const sections =
    existing === undefined
      ? [
          ...record.sections,
          {
            algorithmVersion:
              record.definition.kind === "sphere" ||
              record.definition.kind === "hemisphere" ||
              record.definition.kind === "cylinder" ||
              record.definition.kind === "cone" ||
              record.definition.kind === "truncated-cone"
                ? ("analytic-plane/1" as const)
                : ("polyhedron-plane/1" as const),
            id: sectionId,
            pointIds,
            visible: true,
          },
        ]
      : record.sections;
  return {
    record: { ...record, sections },
    section: calculated.section,
    sectionId,
    status: "ok",
  };
}

export function saveSolidSectionFromPoints(input: {
  readonly pointIds: readonly [
    Solid3DPoint["id"],
    Solid3DPoint["id"],
    Solid3DPoint["id"],
  ];
  readonly record: Solid3DRecord;
  readonly token: string;
}): SolidSectionEditorResult {
  return appendSection(input.record, input.pointIds, input.token);
}

export function saveConstrainedSolidSection(input: {
  readonly constraint: SolidSectionConstraint;
  readonly record: Solid3DRecord;
  readonly token: string;
}): SolidSectionEditorResult {
  if (input.record.sections.length >= 8 || input.record.points.length + 2 > 32)
    return { code: "solid.section.limit", status: "error" };

  const originPoint = input.record.points.find(
    ({ id }) => id === input.constraint.pointId,
  );
  if (originPoint === undefined)
    return { code: "solid.section.points-missing", status: "error" };
  const origin = resolveSolid3DPointPosition(
    input.record.definition,
    originPoint,
  );
  const materialized = materializeSolidSectionConstraint({
    constraint: input.constraint,
    origin,
    record: input.record,
    token: input.token,
  });
  if (materialized === null)
    return { code: "solid.section.outside", status: "error" };
  const provisional: Solid3DRecord = {
    ...input.record,
    points: [...input.record.points, ...materialized.helperPoints],
  };
  const calculated = calculateSolidSection(
    provisional,
    materialized.section.pointIds,
  );
  if (calculated.status === "error") return calculated;
  return {
    record: {
      ...provisional,
      sections: [...provisional.sections, materialized.section],
    },
    section: calculated.section,
    sectionId: materialized.section.id,
    status: "ok",
  };
}

export function removeSavedSolidSection(
  record: Solid3DRecord,
  sectionId: string,
): Solid3DRecord {
  const sections = record.sections.filter(({ id }) => id !== sectionId);
  const referenced = new Set(sections.flatMap(({ pointIds }) => pointIds));
  return {
    ...record,
    points: record.points.filter(
      (point) => !isSolidSectionHelperPoint(point) || referenced.has(point.id),
    ),
    sections,
  };
}

export function setSavedSolidSectionVisibility(
  record: Solid3DRecord,
  sectionId: string,
  visible: boolean,
): Solid3DRecord {
  return {
    ...record,
    sections: record.sections.map((section) =>
      section.id === sectionId ? { ...section, visible } : section,
    ),
  };
}
