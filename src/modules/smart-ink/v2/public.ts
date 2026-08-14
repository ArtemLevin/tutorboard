export { recognizeSmartInkV2, smartInkV2DefaultPolicy } from "./recognizer";
export { createSmartInkTrace, traceDurationMs } from "./trace";
export { extractSmartInkV2Features } from "./features";
export {
  appendSmartInkStrokeSession,
  smartInkSessionPolicy,
  type SmartInkStrokeSession,
  type SmartInkStrokeSessionItem,
} from "./session";
export {
  buildSmartInkRelationGraph,
  type SmartInkRelation,
  type SmartInkRelationKind,
} from "./relation-graph";
export {
  createSmartInkHardNegativeFixtures,
  recordSmartInkV2ShadowDiagnostic,
  smartInkV2GoldQualityTargets,
  subscribeSmartInkV2ShadowDiagnostics,
  transformSmartInkMetamorphic,
  type SmartInkV2ShadowDiagnostic,
} from "./quality";
export {
  smartInkV2Version,
  type SmartInkTrace,
  type SmartInkTracePoint,
  type SmartInkV2Candidate,
  type SmartInkV2Decision,
  type SmartInkV2DecisionStatus,
  type SmartInkV2Features,
  type SmartInkV2Kind,
  type SmartInkV2Policy,
  type SmartInkV2Score,
  type SmartInkV2ShapeKind,
} from "./types";

export {
  SmartInkFieldCorpusRecorder,
  smartInkFieldCorpusSchemaVersion,
  type SmartInkFieldCorpus,
  type SmartInkFieldCorpusSample,
} from "./field-corpus";
export {
  smartInkV2FeatureNames,
  trainSmartInkLinearModel,
  type SmartInkLinearModelArtifact,
  type SmartInkTrainingExample,
} from "./training";
