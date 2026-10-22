// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  glyphCharacterSets,
  mergeSmartInkGlyphCorpora,
  parseSmartInkGlyphCorpus,
  smartInkGlyphCorpusVersion,
  splitSmartInkGlyphCorpus,
  summarizeSmartInkGlyphCorpus,
  targetForGlyph,
} from "../../tools/smart-ink-glyph-corpus.mjs";

function example(id, writerId = "writer-0001", deviceId = "device-0001", extras = {}) {
  return {
    id,
    writerId,
    deviceId,
    browser: "chromium",
    deviceProfile: "windows-desktop",
    pointerType: "pen",
    labelStatus: "reviewed",
    provenance: "captured",
    target: targetForGlyph("Grek", "α"),
    strokes: [
      { points: [
        { x: 10, y: 11, timeMs: 0, pressure: 0.5 },
        { x: 20, y: 25, timeMs: 10, pressure: 0.6 },
      ] },
      { points: [{ x: 20, y: 11, timeMs: 22, pressure: 0.5 }] },
    ],
    ...extras,
  };
}

const corpus = (samples) => ({ schemaVersion: smartInkGlyphCorpusVersion, samples });

describe("Smart Ink glyph corpus v1", () => {
  it("enumerates all Cyrillic, Latin, Greek and digit classes", () => {
    const sizes = Object.fromEntries(
      Object.entries(glyphCharacterSets).map(([script, chars]) => [script, chars.length]),
    );
    expect(sizes).toEqual({ Cyrl: 66, Latn: 52, Grek: 49, Zyyy: 10 });
    expect(Object.values(glyphCharacterSets).flat()).toHaveLength(177);
    for (const [script, chars] of Object.entries(glyphCharacterSets)) {
      expect(new Set(chars).size).toBe(chars.length);
      for (const char of chars) {
        expect(targetForGlyph(script, char)).toEqual({
          kind: "glyph", script, character: char,
        });
      }
    }
  });

  it("validates multi-stroke samples and count statistics", () => {
    const parsed = parseSmartInkGlyphCorpus(corpus([example("sample-001")]));
    expect(parsed.samples[0].strokes).toHaveLength(2);
    expect(summarizeSmartInkGlyphCorpus(parsed)).toMatchObject({
      total: 1, coveredClasses: 1, expectedClasses: 177,
      scripts: { Cyrl: 0, Latn: 0, Grek: 1, Zyyy: 0 },
      writers: 1, devices: 1, unreviewed: 0,
    });
  });

  it("rejects malformed and injected metadata rather than silently accepting it", () => {
    expect(() => parseSmartInkGlyphCorpus(corpus([
      example("sample-001", "Артём"),
    ]))).toThrow();
    expect(() => parseSmartInkGlyphCorpus(corpus([
      example("sample-001", "writer-0001", "device-0001", { userAgent: "leak" }),
    ]))).toThrow();
    expect(() => parseSmartInkGlyphCorpus(corpus([
      example("sample-001"),
      example("sample-001"),
    ]))).toThrow("duplicate");
    expect(() => parseSmartInkGlyphCorpus(corpus([
      example("sample-001", "writer-0001", "device-0001", {
        target: { kind: "glyph", script: "Latn", character: "а" },
      }),
    ]))).toThrow();
    expect(() => parseSmartInkGlyphCorpus(corpus([
      example("sample-001", "writer-0001", "device-0001", {
        strokes: [{ points: [
          { x: 1, y: 1, timeMs: 10, pressure: 0.5 },
          { x: 2, y: 2, timeMs: 5, pressure: 0.5 },
        ] }],
      }),
    ]))).toThrow("nonmonotonic");
    expect(() => parseSmartInkGlyphCorpus(corpus([
      example("sample-001", "writer-0001", "device-0001", {
        strokes: [{ points: [{ x: 2, y: 2, timeMs: 0, pressure: Infinity }] }],
      }),
    ]))).toThrow();
  });

  it("merges only fully validated corpora and rejects duplicate samples", () => {
    const first = corpus([example("sample-001")]);
    const second = corpus([example("sample-002")]);
    expect(mergeSmartInkGlyphCorpora(first, second).samples).toHaveLength(2);
    expect(() => mergeSmartInkGlyphCorpora(first, first)).toThrow("duplicate");
    expect(first.samples).toHaveLength(1);
  });

  it("fails closed on unreviewed labels and insufficient independent authors", () => {
    expect(() => splitSmartInkGlyphCorpus(corpus([
      example("sample-001", "writer-0001", "device-0001", { labelStatus: "unreviewed" }),
      example("sample-002", "writer-0002", "device-0002"),
      example("sample-003", "writer-0003", "device-0003"),
    ]))).toThrow("reviewed");
    expect(() => splitSmartInkGlyphCorpus(corpus([
      example("sample-001"),
      example("sample-002"),
    ]))).toThrow("Three independent");
  });

  it("keeps linked writers and devices entirely in one split", () => {
    const result = splitSmartInkGlyphCorpus(corpus([
      example("sample-001", "writer-0001", "device-0001"),
      example("sample-002", "writer-0002", "device-0001"),
      example("sample-003", "writer-0003", "device-0002"),
      example("sample-004", "writer-0004", "device-0003"),
      example("sample-005", "writer-0005", "device-0004"),
    ]));
    const splits = [result.train, result.calibration, result.holdout];
    expect(splits.map(({ samples }) => samples.length).sort()).toEqual([1, 1, 3]);
    for (let i = 0; i < splits.length; i += 1) {
      for (let j = i + 1; j < splits.length; j += 1) {
        expect(splits[i].samples.some((a) => splits[j].samples.some((b) =>
          a.writerId === b.writerId || a.deviceId === b.deviceId))).toBe(false);
      }
    }
    expect(splits.flatMap(({ samples }) => samples)).toHaveLength(5);
  });
});
