import type { SmartInkGlyphScript } from "./unified";
import type { GlyphPrototypeRank } from "./glyph-prototype";

/**
 * Research-only calibration of an open-set rejection distance.
 * It cannot grant runtime authorization to auto-replace any strokes.
 */
export const smartInkGlyphOpenSetVersion =
  "tutorboard.smart-ink-glyph-open-set-experiment/1" as const;

export type GlyphEvaluationTarget =
  | {
      readonly kind: "glyph";
      readonly script: SmartInkGlyphScript;
      readonly character: string;
    }
  | { readonly kind: "shape" | "ordinary-ink" };

export interface GlyphEvaluationObservation {
  readonly target: GlyphEvaluationTarget;
  readonly candidates: readonly GlyphPrototypeRank[];
}

export interface GlyphExperimentalDistanceGate {
  readonly schemaVersion: typeof smartInkGlyphOpenSetVersion;
  /** Always research-only: not a confidence score or production release flag. */
  readonly status: "research-only";
  /**
   * Strict cutoff on squared feature distance. null = abstain on everything.
   * Derived exclusively from calibration errors and negatives.
   */
  readonly maximumDistanceExclusive: number | null;
  readonly calibrationGlyphs: number;
  readonly calibrationNegatives: number;
  readonly calibrationUnsafe: number;
}

export interface GlyphOpenSetEvaluation {
  readonly total: number;
  readonly glyphCount: number;
  readonly negativeCount: number;
  readonly acceptedCorrectGlyphs: number;
  readonly acceptedWrongGlyphs: number;
  readonly acceptedNegatives: number;
  readonly rejectedGlyphs: number;
  readonly rejectedNegatives: number;
  readonly glyphCoverage: number | null;
  readonly acceptedGlyphPrecision: number | null;
  readonly negativeFalseAcceptanceRate: number | null;
  readonly negativeFalseAcceptanceUpper95: number | null;
  readonly wrongGlyphAcceptanceRate: number | null;
  readonly wrongGlyphAcceptanceUpper95: number | null;
}

/** One-sided Wilson 95% upper bound, including the zero-error case. */
export function wilsonUpper95(
  failures: number,
  attempts: number,
): number | null {
  if (
    !Number.isSafeInteger(attempts) ||
    attempts < 0 ||
    !Number.isSafeInteger(failures) ||
    failures < 0 ||
    failures > attempts
  ) {
    throw new TypeError("Invalid Wilson sample counts.");
  }
  if (attempts === 0) return null;
  const z = 1.6448536269514722;
  const p = failures / attempts;
  const zz = z * z;
  const denominator = 1 + zz / attempts;
  const center = p + zz / (2 * attempts);
  const radius =
    z * Math.sqrt((p * (1 - p)) / attempts + zz / (4 * attempts * attempts));
  return Math.min(1, (center + radius) / denominator);
}

function nearest(
  observation: GlyphEvaluationObservation,
): GlyphPrototypeRank | null {
  const item = observation.candidates[0];
  if (item === undefined) return null;
  if (
    !Number.isFinite(item.distance) ||
    item.distance < 0 ||
    observation.candidates.some(
      (candidate, index) =>
        !Number.isFinite(candidate.distance) ||
        candidate.distance < 0 ||
        (index > 0 &&
          candidate.distance < observation.candidates[index - 1]!.distance),
    )
  ) {
    throw new TypeError("Unsorted or invalid glyph candidate distances.");
  }
  return item;
}

function matches(
  target: GlyphEvaluationTarget,
  candidate: GlyphPrototypeRank,
): boolean {
  return (
    target.kind === "glyph" &&
    target.script === candidate.script &&
    target.character === candidate.character
  );
}

export function deriveGlyphExperimentalDistanceGate(
  calibration: readonly GlyphEvaluationObservation[],
): GlyphExperimentalDistanceGate {
  let glyphs = 0;
  let negatives = 0;
  let unsafe = 0;
  let unsafeMinimum = Number.POSITIVE_INFINITY;
  for (const observation of calibration) {
    if (observation.target.kind === "glyph") glyphs += 1;
    else negatives += 1;
    const top = nearest(observation);
    if (top !== null && !matches(observation.target, top)) {
      unsafe += 1;
      unsafeMinimum = Math.min(unsafeMinimum, top.distance);
    }
  }
  // No negative samples means no defensible open-set cutoff.
  // No mistaken classifications or negatives with predictions also means no
  // data-driven upper limit: fail closed.
  const cutoff =
    negatives > 0 && Number.isFinite(unsafeMinimum) && unsafeMinimum > 0
      ? unsafeMinimum
      : null;
  return {
    schemaVersion: smartInkGlyphOpenSetVersion,
    status: "research-only",
    maximumDistanceExclusive: cutoff,
    calibrationGlyphs: glyphs,
    calibrationNegatives: negatives,
    calibrationUnsafe: unsafe,
  };
}

/** Never use this result as SmartInkGlyphEvidence: ready in production. */
export function selectGlyphResearchOnly(
  policy: GlyphExperimentalDistanceGate,
  observation: GlyphEvaluationObservation,
): GlyphPrototypeRank | null {
  if (
    policy.status !== "research-only" ||
    policy.schemaVersion !== smartInkGlyphOpenSetVersion ||
    policy.maximumDistanceExclusive === null
  )
    return null;
  const top = nearest(observation);
  if (top === null || top.distance >= policy.maximumDistanceExclusive)
    return null;
  const second = observation.candidates[1];
  // Equal-distance homographs require explicit script context or user choice.
  if (second !== undefined && second.distance <= top.distance) return null;
  return top;
}

/** Holdout evaluation only; no threshold tuning or data mutation occurs. */
export function evaluateGlyphOpenSet(
  policy: GlyphExperimentalDistanceGate,
  observations: readonly GlyphEvaluationObservation[],
): GlyphOpenSetEvaluation {
  let glyphCount = 0,
    negativeCount = 0;
  let acceptedCorrectGlyphs = 0,
    acceptedWrongGlyphs = 0,
    acceptedNegatives = 0;
  let rejectedGlyphs = 0,
    rejectedNegatives = 0;
  for (const observation of observations) {
    const selected = selectGlyphResearchOnly(policy, observation);
    if (observation.target.kind === "glyph") {
      glyphCount += 1;
      if (selected === null) rejectedGlyphs += 1;
      else if (matches(observation.target, selected))
        acceptedCorrectGlyphs += 1;
      else acceptedWrongGlyphs += 1;
    } else {
      negativeCount += 1;
      if (selected === null) rejectedNegatives += 1;
      else acceptedNegatives += 1;
    }
  }
  const acceptedGlyphs = acceptedCorrectGlyphs + acceptedWrongGlyphs;
  return {
    total: observations.length,
    glyphCount,
    negativeCount,
    acceptedCorrectGlyphs,
    acceptedWrongGlyphs,
    acceptedNegatives,
    rejectedGlyphs,
    rejectedNegatives,
    glyphCoverage: glyphCount > 0 ? acceptedGlyphs / glyphCount : null,
    acceptedGlyphPrecision:
      acceptedGlyphs > 0 ? acceptedCorrectGlyphs / acceptedGlyphs : null,
    negativeFalseAcceptanceRate:
      negativeCount > 0 ? acceptedNegatives / negativeCount : null,
    negativeFalseAcceptanceUpper95: wilsonUpper95(
      acceptedNegatives,
      negativeCount,
    ),
    wrongGlyphAcceptanceRate:
      glyphCount > 0 ? acceptedWrongGlyphs / glyphCount : null,
    wrongGlyphAcceptanceUpper95: wilsonUpper95(acceptedWrongGlyphs, glyphCount),
  };
}
