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
  createSmartInkReplacementObject,
  proposeSmartInkReplacement,
  smartInkCanvasRecognitionPolicy,
  type SmartInkBoardProposal,
  type SmartInkBoardProposalResult,
} from "./proposal";
