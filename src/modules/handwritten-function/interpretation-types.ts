import type { ExpressionDiagnosticCode } from "../../core/public";
import type { MathInkRecognitionFormat } from "./types";

export const handwrittenFunctionInterpretationSchemaVersion =
  "tutorboard.handwritten-function-interpretation/0.1" as const;

export const handwrittenFunctionInterpretationLimits = {
  ambiguityConfidenceMargin: 0.08,
  maximumCandidateCount: 16,
  maximumCandidateSourceLength: 8_192,
  maximumConversionDepth: 64,
  maximumJiixDepth: 48,
  maximumJiixNodes: 2_048,
  maximumJiixStrings: 64,
} as const;

export type HandwrittenFunctionInterpretationStatus =
  "accepted" | "ambiguous" | "rejected";

export type HandwrittenFunctionInterpretationDiagnosticSeverity =
  "error" | "info" | "warning";

export type HandwrittenFunctionInterpretationDiagnosticCode =
  | "handwriting.interpretation.ambiguous"
  | "handwriting.interpretation.candidate-limit"
  | "handwriting.interpretation.empty-source"
  | "handwriting.interpretation.invalid-parameter"
  | "handwriting.interpretation.jiix-depth-limit"
  | "handwriting.interpretation.jiix-node-limit"
  | "handwriting.interpretation.jiix-parse"
  | "handwriting.interpretation.jiix-string-limit"
  | "handwriting.interpretation.jiix-unsupported"
  | "handwriting.interpretation.latex-depth-limit"
  | "handwriting.interpretation.latex-malformed"
  | "handwriting.interpretation.latex-subscript"
  | "handwriting.interpretation.latex-unsupported-command"
  | "handwriting.interpretation.no-valid-candidate"
  | "handwriting.interpretation.parameter-limit"
  | "handwriting.interpretation.provider"
  | "handwriting.interpretation.source-too-long"
  | "handwriting.interpretation.unsupported-function"
  | "handwriting.interpretation.unsupported-relation"
  | ExpressionDiagnosticCode;

export interface HandwrittenFunctionInterpretationDiagnostic {
  readonly candidateIndex: number | null;
  readonly code: HandwrittenFunctionInterpretationDiagnosticCode;
  readonly end?: number;
  readonly message: string;
  readonly severity: HandwrittenFunctionInterpretationDiagnosticSeverity;
  readonly start?: number;
}

export interface HandwrittenFunctionInterpretedCandidate {
  readonly candidateIndex: number;
  readonly confidence: number | null;
  readonly expression: string;
  readonly normalizedExpression: string;
  readonly parameters: readonly string[];
  readonly sourceExpression: string;
  readonly sourceFormat: MathInkRecognitionFormat;
}

export interface HandwrittenFunctionInterpretation {
  readonly candidates: readonly HandwrittenFunctionInterpretedCandidate[];
  readonly diagnostics: readonly HandwrittenFunctionInterpretationDiagnostic[];
  readonly schemaVersion: typeof handwrittenFunctionInterpretationSchemaVersion;
  readonly selected: HandwrittenFunctionInterpretedCandidate | null;
  readonly status: HandwrittenFunctionInterpretationStatus;
}
