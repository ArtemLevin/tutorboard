import { describe, expect, it } from "vitest";

import {
  deriveGlyphExperimentalDistanceGate,
  evaluateGlyphOpenSet,
  selectGlyphResearchOnly,
  smartInkGlyphOpenSetVersion,
  wilsonUpper95,
  type GlyphEvaluationObservation,
} from "../../../../src/modules/smart-ink/v2/glyph-open-set";

const glyph = (script: "Latn" | "Grek", character: string) => ({
  kind: "glyph" as const,
  script,
  character,
});
const candidate = (
  distance: number,
  script: "Latn" | "Grek" = "Latn",
  character = "A",
) => ({
  distance,
  script,
  character,
});
const example = (
  target: GlyphEvaluationObservation["target"],
  ...candidates: ReturnType<typeof candidate>[]
): GlyphEvaluationObservation => ({ target, candidates });

describe("Smart Ink glyph open-set research gate", () => {
  const calibration = [
    example(glyph("Latn", "A"), candidate(0.1), candidate(0.7, "Latn", "B")),
    example(glyph("Grek", "α"), candidate(0.15, "Grek", "α")),
    example(glyph("Latn", "B"), candidate(0.25), candidate(0.4, "Latn", "B")),
    example({ kind: "shape" }, candidate(0.3)),
    example({ kind: "ordinary-ink" }, candidate(0.5)),
  ] satisfies GlyphEvaluationObservation[];

  it("sets a strict cutoff from calibration mistakes and negative examples", () => {
    const policy = deriveGlyphExperimentalDistanceGate(calibration);
    expect(policy).toEqual({
      schemaVersion: smartInkGlyphOpenSetVersion,
      status: "research-only",
      maximumDistanceExclusive: 0.25,
      calibrationGlyphs: 3,
      calibrationNegatives: 2,
      calibrationUnsafe: 3,
    });
    expect(selectGlyphResearchOnly(policy, calibration[0]!)).toMatchObject({
      character: "A",
      distance: 0.1,
    });
    expect(selectGlyphResearchOnly(policy, calibration[2]!)).toBeNull();
    expect(selectGlyphResearchOnly(policy, calibration[3]!)).toBeNull();
    expect(evaluateGlyphOpenSet(policy, calibration)).toMatchObject({
      acceptedCorrectGlyphs: 2,
      acceptedWrongGlyphs: 0,
      acceptedNegatives: 0,
      rejectedGlyphs: 1,
      rejectedNegatives: 2,
    });
  });

  it("never tunes threshold on holdout and measures false accepts independently", () => {
    const policy = deriveGlyphExperimentalDistanceGate(calibration);
    const holdout = [
      example(glyph("Latn", "B"), candidate(0.15), candidate(0.7, "Latn", "B")),
      example(glyph("Latn", "A"), candidate(0.2)),
      example({ kind: "shape" }, candidate(0.18)),
      example({ kind: "ordinary-ink" }, candidate(0.32)),
    ];
    const evaluation = evaluateGlyphOpenSet(policy, holdout);
    expect(evaluation).toMatchObject({
      glyphCount: 2,
      negativeCount: 2,
      acceptedCorrectGlyphs: 1,
      acceptedWrongGlyphs: 1,
      acceptedNegatives: 1,
      rejectedNegatives: 1,
      glyphCoverage: 1,
      acceptedGlyphPrecision: 0.5,
      negativeFalseAcceptanceRate: 0.5,
      wrongGlyphAcceptanceRate: 0.5,
    });
    expect(evaluation.negativeFalseAcceptanceUpper95).toBeGreaterThan(0.5);
    expect(policy.maximumDistanceExclusive).toBe(0.25);
  });

  it("blocks tied homographs even if distance is small", () => {
    const policy = deriveGlyphExperimentalDistanceGate(calibration);
    const tied = example(
      glyph("Latn", "A"),
      candidate(0.05, "Grek", "Α"),
      candidate(0.05, "Latn", "A"),
    );
    expect(selectGlyphResearchOnly(policy, tied)).toBeNull();
  });

  it("fails closed when calibration lacks negatives or a safe separating distance", () => {
    const positiveOnly = deriveGlyphExperimentalDistanceGate([
      example(glyph("Latn", "A"), candidate(0.01)),
    ]);
    expect(positiveOnly.maximumDistanceExclusive).toBeNull();
    expect(
      selectGlyphResearchOnly(
        positiveOnly,
        example(glyph("Latn", "A"), candidate(0)),
      ),
    ).toBeNull();

    const collision = deriveGlyphExperimentalDistanceGate([
      example(glyph("Latn", "A"), candidate(0.1)),
      example({ kind: "shape" }, candidate(0)),
    ]);
    expect(collision.maximumDistanceExclusive).toBeNull();
  });

  it("rejects invalid or unsorted distances and handles empty candidates", () => {
    const policy = deriveGlyphExperimentalDistanceGate(calibration);
    expect(() =>
      selectGlyphResearchOnly(
        policy,
        example(glyph("Latn", "A"), candidate(NaN)),
      ),
    ).toThrow("distance");
    expect(() =>
      selectGlyphResearchOnly(
        policy,
        example(glyph("Latn", "A"), candidate(0.15), candidate(0.1)),
      ),
    ).toThrow("distance");
    expect(
      selectGlyphResearchOnly(policy, example(glyph("Latn", "A"))),
    ).toBeNull();
  });

  it("computes a nonzero 95% upper confidence bound for zero observed failures", () => {
    expect(wilsonUpper95(0, 0)).toBeNull();
    expect(wilsonUpper95(0, 10)).toBeGreaterThan(0.2);
    expect(wilsonUpper95(0, 600)).toBeLessThan(0.005);
    expect(wilsonUpper95(10, 10)).toBe(1);
    expect(() => wilsonUpper95(2, 1)).toThrow();
  });
});
