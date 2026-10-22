// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  emptyStudioCorpus,
  exportLegacyGeometryCorpus,
  mergeStudioCorpus,
  parseStudioBackup,
  relabelStudioSample,
  removeStudioSample,
  studioLocalSchema,
} from "../../tools/smart-ink-calibration-studio-core.mjs";
import {
  parseSmartInkGlyphCorpus,
  smartInkGlyphCorpusVersion,
  targetForGlyph,
} from "../../tools/smart-ink-glyph-corpus.mjs";
import { parseSmartInkCorpus } from "../../src/modules/smart-ink-spike/public";

const metadata = {
  writerId: "writer-test-01",
  deviceId: "device-test-01",
  deviceProfile: "windows-desktop",
  browser: "chromium",
};
const pts = [
  { x: 10, y: 20, timeMs: 0, pressure: 0.5 },
  { x: 80, y: 60, timeMs: 30, pressure: 0.5 },
];
function sample(id, target = targetForGlyph("Grek", "α")) {
  return {
    ...metadata,
    id,
    target,
    pointerType: "mouse",
    labelStatus: "unreviewed",
    provenance: "captured",
    strokes: [{ points: pts }],
  };
}
const glyph = (samples) => ({
  schemaVersion: smartInkGlyphCorpusVersion,
  samples,
});
const legacy = (id = "captured-circle-test-012345") => ({
  schemaVersion: "tutorboard.smart-ink-corpus/0.1",
  samples: [
    {
      id,
      expectedKind: "circle",
      acceptableKinds: ["circle", "ellipse"],
      points: [
        { x: 20, y: 40 },
        { x: 70, y: 40 },
      ],
      metadata: {
        browser: "chromium",
        deviceProfile: "windows-desktop",
        durationMs: 120,
        pointerType: "mouse",
      },
      provenance: "captured",
      shouldPropose: true,
    },
  ],
});

describe("Smart Ink Calibration Studio corpus compatibility", () => {
  it("imports and exports the existing versioned geometry corpus", () => {
    const merged = mergeStudioCorpus(
      emptyStudioCorpus(),
      legacy(),
      metadata,
      () => "unused",
    );
    expect(merged.samples).toHaveLength(1);
    expect(merged.samples[0].target).toEqual({
      kind: "shape",
      shape: "circle",
    });
    expect(merged.samples[0].labelStatus).toBe("unreviewed");
    const output = exportLegacyGeometryCorpus(merged);
    expect(output.samples[0].expectedKind).toBe("circle");
    expect(output.samples[0].points).toEqual(legacy().samples[0].points);
    expect(parseSmartInkCorpus(output).schemaVersion).toBe(
      "tutorboard.smart-ink-corpus/0.1",
    );
  });

  it("rejects repeat import of same legacy sample with stable identity", () => {
    const first = mergeStudioCorpus(
      emptyStudioCorpus(),
      legacy(),
      metadata,
      () => "unused",
    );
    expect(() =>
      mergeStudioCorpus(first, legacy(), metadata, () => "unused"),
    ).toThrow("duplicate");
  });

  it("imports existing multilingual glyph JSON without altering classes", () => {
    const merged = mergeStudioCorpus(
      emptyStudioCorpus(),
      glyph([
        sample("sample-greek-001"),
        sample("sample-cyrl-001", targetForGlyph("Cyrl", "Ж")),
        sample("sample-latn-001", targetForGlyph("Latn", "A")),
      ]),
      metadata,
      () => "unused",
    );
    expect(merged.samples).toHaveLength(3);
    expect(parseSmartInkGlyphCorpus(merged)).toEqual(merged);
  });

  it("keeps multi-stroke shapes in common JSON and omits them from legacy geometry", () => {
    const data = glyph([
      sample("sample-shape-001", { kind: "shape", shape: "triangle" }),
      {
        ...sample("sample-shape-002", { kind: "shape", shape: "square" }),
        strokes: [
          { points: pts },
          { points: [{ x: 80, y: 90, timeMs: 40, pressure: 0.5 }] },
        ],
      },
      sample("sample-glyph-001"),
    ]);
    expect(exportLegacyGeometryCorpus(data).samples).toHaveLength(1);
    expect(exportLegacyGeometryCorpus(data).samples[0].expectedKind).toBe(
      "triangle",
    );
  });

  it("relabels existing sample without claiming independent label review", () => {
    const before = glyph([{ ...sample("sample-a"), labelStatus: "reviewed" }]);
    const edited = relabelStudioSample(before, "sample-a", {
      kind: "shape",
      shape: "line",
    });
    expect(edited.samples[0].labelStatus).toBe("unreviewed");
    expect(edited.samples[0].target).toEqual({ kind: "shape", shape: "line" });
    expect(edited.samples[0].strokes).toEqual(before.samples[0].strokes);
    expect(before.samples[0].labelStatus).toBe("reviewed");
    expect(removeStudioSample(edited, "sample-a").samples).toHaveLength(0);
  });

  it("rejects malformed legacy imports as a whole and protects prior corpus", () => {
    const original = glyph([sample("sample-good")]);
    const damaged = legacy();
    damaged.samples[0].points[0].x = NaN;
    expect(() =>
      mergeStudioCorpus(original, damaged, metadata, () => "unused"),
    ).toThrow();
    expect(original.samples).toHaveLength(1);
    expect(() =>
      mergeStudioCorpus(
        original,
        {
          ...legacy(),
          samples: [legacy().samples[0], legacy().samples[0]],
        },
        metadata,
        () => "unused",
      ),
    ).toThrow();
    expect(() =>
      relabelStudioSample(original, "unknown-id", {
        kind: "shape",
        shape: "circle",
      }),
    ).toThrow();
  });

  it("checks local backup version and corpus validation", () => {
    const data = glyph([sample("sample-good")]);
    expect(
      parseStudioBackup({ schemaVersion: studioLocalSchema, corpus: data }),
    ).toEqual(data);
    expect(() =>
      parseStudioBackup({ schemaVersion: "unknown", corpus: data }),
    ).toThrow();
    expect(() =>
      parseStudioBackup({
        schemaVersion: studioLocalSchema,
        corpus: { samples: [] },
      }),
    ).toThrow();
  });
});
