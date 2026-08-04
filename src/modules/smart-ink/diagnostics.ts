import type { BoardObjectKind, Vec2 } from "../../core/public";
import type {
  SmartInkPrimitiveKind,
  SmartInkProposal,
} from "../smart-ink-spike/public";

export const smartInkDiagnosticSchemaVersion =
  "tutorboard.smart-ink-diagnostic/0.1" as const;

export type SmartInkDiagnosticReason =
  | "proposal-created"
  | "recognizer-ambiguous"
  | "recognizer-unrecognized"
  | "replacement-not-renderable";

export interface SmartInkDiagnosticRecord {
  readonly outcome: "proposed" | "skipped";
  readonly points: readonly Vec2[];
  readonly reason: SmartInkDiagnosticReason;
  readonly recognizer: SmartInkProposal;
  readonly replacementKind: BoardObjectKind | null;
  readonly schemaVersion: typeof smartInkDiagnosticSchemaVersion;
  readonly selectedCandidateKind: SmartInkPrimitiveKind | "arrow" | null;
  readonly sourcePointCount: number;
}

type SmartInkDiagnosticListener = (record: SmartInkDiagnosticRecord) => void;

const listeners = new Set<SmartInkDiagnosticListener>();

export function recordSmartInkDiagnostic(
  record: SmartInkDiagnosticRecord,
): void {
  for (const listener of listeners) {
    listener(record);
  }
}

export function subscribeSmartInkDiagnostics(
  listener: SmartInkDiagnosticListener,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
