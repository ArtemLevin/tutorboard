import type {
  CommandMetadata,
  PenStrokeObject,
  ReplaceObjectsCommand,
} from "../../core/public";

import type { SmartInkBoardProposal } from "./proposal";
import type { SmartInkCompositeProposal } from "./composite-recognizer";

export function createAcceptSmartInkProposalCommand(
  metadata: CommandMetadata,
  proposal: SmartInkBoardProposal,
): ReplaceObjectsCommand {
  return {
    ...metadata,
    kind: "core.objects.replace",
    originals: [proposal.original],
    replacements: [proposal.replacement],
  };
}

export function createAcceptSmartInkCompositeCommand(
  metadata: CommandMetadata,
  proposal: SmartInkCompositeProposal,
): ReplaceObjectsCommand {
  return {
    ...metadata,
    kind: "core.objects.replace",
    originals: proposal.originals,
    replacements: proposal.replacements,
  };
}

export function smartInkProposalStillApplies(
  proposal: SmartInkBoardProposal,
  object: PenStrokeObject | undefined,
): boolean {
  return object === proposal.original;
}
