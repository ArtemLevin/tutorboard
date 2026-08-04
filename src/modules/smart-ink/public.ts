export {
  createAcceptSmartInkProposalCommand,
  smartInkProposalStillApplies,
} from "./commands";
export {
  smartInkDiagnosticSchemaVersion,
  subscribeSmartInkDiagnostics,
  type SmartInkDiagnosticReason,
  type SmartInkDiagnosticRecord,
} from "./diagnostics";
export {
  recognizeSmartInkArrow,
  smartInkArrowRecognizerVersion,
  type SmartInkArrowCandidate,
  type SmartInkArrowGeometry,
  type SmartInkArrowProposal,
} from "./arrow-recognizer";
export {
  createSmartInkReplacementObject,
  proposeSmartInkReplacement,
  smartInkCanvasRecognitionPolicy,
  type SmartInkBoardProposal,
  type SmartInkBoardCandidate,
  type SmartInkBoardProposalResult,
} from "./proposal";
