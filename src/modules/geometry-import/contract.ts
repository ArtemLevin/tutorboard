import type {
  BoardObjectId,
  GeometryImportId,
  GroupId,
  JsonValue,
} from "../../core/public";

export type GeometryImportDiagnosticSeverity = "error" | "warning";

export type GeometryImportDiagnosticCode =
  | "geometry-import.ambiguous-triangle-edge"
  | "geometry-import.board-id-collision"
  | "geometry-import.complexity-limit-exceeded"
  | "geometry-import.degenerate-reference"
  | "geometry-import.duplicate-constraint-id"
  | "geometry-import.duplicate-construction-step-id"
  | "geometry-import.duplicate-object-id"
  | "geometry-import.explicit-segment-reused"
  | "geometry-import.generated-id-too-long"
  | "geometry-import.invalid-gir"
  | "geometry-import.layout-element-missing"
  | "geometry-import.layout-reference-missing"
  | "geometry-import.layout-source-mismatch"
  | "geometry-import.missing-reference"
  | "geometry-import.no-supported-visual-entities"
  | "geometry-import.reference-kind-mismatch"
  | "geometry-import.synthetic-point-label-created"
  | "geometry-import.synthetic-triangle-edge-created"
  | "geometry-import.unsupported-gir-version"
  | "geometry-import.unsupported-visual-entity";

export type GeometryImportFailureCode = Extract<
  GeometryImportDiagnosticCode,
  | "geometry-import.ambiguous-triangle-edge"
  | "geometry-import.board-id-collision"
  | "geometry-import.complexity-limit-exceeded"
  | "geometry-import.degenerate-reference"
  | "geometry-import.duplicate-constraint-id"
  | "geometry-import.duplicate-construction-step-id"
  | "geometry-import.duplicate-object-id"
  | "geometry-import.generated-id-too-long"
  | "geometry-import.invalid-gir"
  | "geometry-import.layout-element-missing"
  | "geometry-import.layout-reference-missing"
  | "geometry-import.layout-source-mismatch"
  | "geometry-import.missing-reference"
  | "geometry-import.no-supported-visual-entities"
  | "geometry-import.reference-kind-mismatch"
  | "geometry-import.unsupported-gir-version"
>;

export interface GeometryImportDiagnostic {
  readonly code: GeometryImportDiagnosticCode;
  readonly girEntityId: string | null;
  readonly path: string | null;
  readonly relatedGirEntityIds: readonly string[];
  readonly severity: GeometryImportDiagnosticSeverity;
}

export interface PointSemanticCandidate {
  readonly boardObjectId: BoardObjectId;
  readonly girEntityId: string;
  readonly kind: "point";
}

export interface SegmentSemanticCandidate {
  readonly boardObjectId: BoardObjectId;
  readonly endPointGirId: string;
  readonly kind: "segment";
  readonly origin:
    | {
        readonly girEntityId: string;
        readonly kind: "explicit-segment";
      }
    | {
        readonly edgeIndex: 0 | 1 | 2;
        readonly kind: "triangle-edge";
        readonly triangleGirEntityId: string;
      };
  readonly representedGirEntityIds: readonly string[];
  readonly startPointGirId: string;
}

export interface LabelSemanticCandidate {
  readonly boardObjectId: BoardObjectId;
  readonly kind: "label";
  readonly origin:
    | {
        readonly girEntityId: string;
        readonly kind: "explicit-label";
      }
    | {
        readonly kind: "point-label";
        readonly pointGirEntityId: string;
      };
  readonly targetGirEntityId: string;
  readonly text: string;
}

export type GeometrySemanticCandidate =
  LabelSemanticCandidate | PointSemanticCandidate | SegmentSemanticCandidate;

export interface GeometrySemanticProvenance {
  readonly primaryGirEntityId: string;
  readonly primaryGirEntityType: string;
  readonly representedGirEntityIds: readonly string[];
  readonly role: "label" | "point" | "segment";
}

export interface GeometrySemanticReference {
  readonly role: string;
  readonly sourceCategory: "constraint" | "construction-step" | "object";
  readonly sourceId: string;
  readonly targetCategory: "constraint" | "object";
  readonly targetId: string;
}

export interface GeometryImportSemanticPlan {
  readonly candidates: readonly GeometrySemanticCandidate[];
  readonly girSchemaVersion: "0.2.0";
  readonly importId: GeometryImportId;
  readonly mapping: Readonly<Record<string, readonly BoardObjectId[]>>;
  readonly provenanceByBoardObjectId: Readonly<
    Record<BoardObjectId, GeometrySemanticProvenance>
  >;
  readonly references: readonly GeometrySemanticReference[];
  readonly rootGroupId: GroupId;
}

export interface CreateGeometryImportSemanticPlanInput {
  readonly canonicalGir: JsonValue;
  readonly importId: GeometryImportId;
}

export type GeometryImportSemanticPlanResult =
  | {
      readonly diagnostics: readonly GeometryImportDiagnostic[];
      readonly plan: GeometryImportSemanticPlan;
      readonly status: "success";
    }
  | {
      readonly code: GeometryImportFailureCode;
      readonly diagnostics: readonly GeometryImportDiagnostic[];
      readonly status: "failure";
    };
