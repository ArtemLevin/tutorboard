import type {
  SmartInkV2Decision,
  SmartInkV2ShapeKind,
} from "./types";

export const smartInkUnifiedDecisionVersion =
  "tutorboard.smart-ink-unified/1" as const;

export type SmartInkGlyphScript = "Cyrl" | "Grek" | "Latn" | "Zyyy";

export interface SmartInkGlyphCandidate {
  readonly kind: "glyph";
  readonly probability: number;
  readonly script: SmartInkGlyphScript;
  readonly text: string;
}

export type SmartInkUnifiedCandidate =
  | SmartInkGlyphCandidate
  | {
      readonly kind: "shape";
      readonly probability: number;
      readonly shape: SmartInkV2ShapeKind;
    };

export type SmartInkGlyphEvidence =
  | { readonly status: "disabled" | "pending" }
  | {
      readonly candidates: readonly SmartInkGlyphCandidate[];
      readonly status: "ready";
    };

export interface SmartInkUnifiedPolicy {
  /** Candidates must be calibrated before enabling glyph auto-accept. */
  readonly glyphAcceptanceThreshold: number;
  readonly glyphAmbiguityThreshold: number;
  readonly glyphShapeConflictThreshold: number;
  readonly glyphTopTwoMargin: number;
}

export const smartInkUnifiedDefaultPolicy: SmartInkUnifiedPolicy = {
  glyphAcceptanceThreshold: 0.93,
  glyphAmbiguityThreshold: 0.75,
  glyphShapeConflictThreshold: 0.55,
  glyphTopTwoMargin: 0.12,
};

export interface SmartInkUnifiedDecision {
  readonly candidate: SmartInkUnifiedCandidate | null;
  readonly alternatives: readonly SmartInkUnifiedCandidate[];
  readonly status:
    | "accepted"
    | "ambiguous"
    | "ordinary-ink"
    | "pending"
    | "unrecognized";
  readonly version: typeof smartInkUnifiedDecisionVersion;
}

function isSupportedGlyph(candidate: SmartInkGlyphCandidate): boolean {
  if (
    !Number.isFinite(candidate.probability) ||
    candidate.probability < 0 ||
    candidate.probability > 1 ||
    Array.from(candidate.text).length !== 1 ||
    candidate.text !== candidate.text.normalize("NFC")
  ) {
    return false;
  }
  switch (candidate.script) {
    case "Cyrl":
      return /^[А-Яа-яЁё]$/u.test(candidate.text);
    case "Latn":
      return /^[A-Za-z]$/u.test(candidate.text);
    case "Grek":
      return /^[Α-ΡΣ-Ωα-ω]$/u.test(candidate.text);
    case "Zyyy":
      return /^[0-9]$/u.test(candidate.text);
  }
}

function shapeCandidate(
  decision: SmartInkV2Decision,
): SmartInkUnifiedCandidate | null {
  if (
    decision.status !== "accepted" ||
    decision.candidate === null ||
    decision.selectedKind === "ordinary-ink" ||
    decision.candidate.kind !== decision.selectedKind
  ) {
    return null;
  }
  const probability =
    decision.scores.find(({ kind }) => kind === decision.selectedKind)
      ?.probability ?? 0;
  return {
    kind: "shape",
    probability,
    shape: decision.selectedKind,
  };
}

function decision(
  status: SmartInkUnifiedDecision["status"],
  candidate: SmartInkUnifiedCandidate | null,
  alternatives: readonly SmartInkUnifiedCandidate[],
): SmartInkUnifiedDecision {
  return {
    alternatives: alternatives.slice(0, 3),
    candidate,
    status,
    version: smartInkUnifiedDecisionVersion,
  };
}

/**
 * Central arbitration boundary for geometry, glyphs and untouched ink.
 *
 * The existing geometric decision stays authoritative when glyph inference is
 * disabled. Pending glyph inference never commits an early geometric result.
 * A credible glyph/shape conflict abstains until the user or a calibrated
 * future contextual model resolves it.
 */
export function resolveSmartInkUnifiedDecision(
  geometry: SmartInkV2Decision,
  glyphEvidence: SmartInkGlyphEvidence,
  policy: SmartInkUnifiedPolicy = smartInkUnifiedDefaultPolicy,
): SmartInkUnifiedDecision {
  const shape = shapeCandidate(geometry);
  if (glyphEvidence.status === "pending") {
    return decision("pending", null, shape === null ? [] : [shape]);
  }
  if (glyphEvidence.status === "disabled") {
    return shape === null
      ? decision(geometry.status, null, [])
      : decision("accepted", shape, [shape]);
  }

  const glyphs = glyphEvidence.candidates
    .filter(isSupportedGlyph)
    .sort(
      (left, right) =>
        right.probability - left.probability ||
        left.script.localeCompare(right.script) ||
        left.text.localeCompare(right.text),
    );
  const alternatives = [
    ...glyphs,
    ...(shape === null ? [] : [shape]),
  ].sort((left, right) => right.probability - left.probability);
  const topGlyph = glyphs[0];
  if (topGlyph === undefined) {
    return shape === null
      ? decision(geometry.status, null, [])
      : decision("accepted", shape, [shape]);
  }
  const glyphCredible =
    topGlyph.probability >= policy.glyphAmbiguityThreshold;
  const glyphShapeConflict =
    shape !== null &&
    topGlyph.probability >= policy.glyphShapeConflictThreshold;
  const glyphsCompete =
    glyphs[1] !== undefined &&
    topGlyph.probability - glyphs[1].probability <
      policy.glyphTopTwoMargin;

  if (glyphShapeConflict || (glyphCredible && geometry.status === "ambiguous")) {
    return decision("ambiguous", null, alternatives);
  }
  if (
    glyphCredible &&
    (glyphsCompete ||
      topGlyph.probability < policy.glyphAcceptanceThreshold)
  ) {
    return decision("ambiguous", null, alternatives);
  }
  if (topGlyph.probability >= policy.glyphAcceptanceThreshold) {
    return decision("accepted", topGlyph, alternatives);
  }
  if (shape !== null) return decision("accepted", shape, alternatives);
  return decision(geometry.status, null, alternatives);
}
