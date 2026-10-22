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

export {
  resolveSmartInkUnifiedDecision,
  smartInkUnifiedDecisionVersion,
  smartInkUnifiedDefaultPolicy,
  type SmartInkGlyphCandidate,
  type SmartInkGlyphEvidence,
  type SmartInkGlyphScript,
  type SmartInkUnifiedCandidate,
  type SmartInkUnifiedDecision,
  type SmartInkUnifiedPolicy,
} from "./unified";
export {
  appendSmartInkGlyphSession,
  expireSmartInkGlyphSession,
  flushSmartInkGlyphSession,
  initialSmartInkGlyphSession,
  smartInkGlyphSessionPolicy,
  type SmartInkGlyphSession,
  type SmartInkGlyphSessionPolicy,
  type SmartInkGlyphSessionStroke,
  type SmartInkGlyphSessionTransition,
} from "./glyph-session";

export {
  createGlyphPrototypeProvider,
  extractGlyphPrototypeFeatures,
  parseGlyphPrototypeModel,
  rankGlyphPrototype,
  smartInkGlyphPrototypeFeatureCount,
  smartInkGlyphPrototypeFeatureVersion,
  smartInkGlyphPrototypeSchema,
  trainGlyphPrototypeModel,
  type GlyphPrototypeClass,
  type GlyphPrototypeExample,
  type GlyphPrototypeModel,
  type GlyphPrototypePoint,
  type GlyphPrototypeRank,
  type GlyphPrototypeResult,
  type GlyphPrototypeStroke,
  type SmartInkGlyphPrototypeProvider,
} from "./glyph-prototype";
export {
  deriveGlyphExperimentalDistanceGate,
  evaluateGlyphOpenSet,
  selectGlyphResearchOnly,
  smartInkGlyphOpenSetVersion,
  wilsonUpper95,
  type GlyphEvaluationObservation,
  type GlyphEvaluationTarget,
  type GlyphExperimentalDistanceGate,
  type GlyphOpenSetEvaluation,
} from "./glyph-open-set";
