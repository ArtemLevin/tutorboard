import { describe, expect, it } from "vitest";

import {
  parseIceBaselineLog,
  summarizeIceBaseline,
} from "../../scripts/c39/summarize-ice-baseline.mjs";

const cases = [
  ["ice2-1000-static", 1000, 800],
  ["ice2-3000-static", 3000, 2400],
  ["ice2-5000-static", 5000, 4000],
  ["ice2-10000-static", 10000, 8000],
];
const largeCases = [
  ["ice2-30000-offscreen", 30000, 1000],
  ["ice2-100000-offscreen", 100000, 1000],
];

function phase(count, p95 = 35) {
  return {
    count,
    p50Ms: 16,
    p95Ms: p95,
    p99Ms: p95 + 8,
    maxMs: p95 + 10,
    over25: 10,
    over50: 2,
    over100: 0,
  };
}

function makeReport([name, strokes, visibleStrokes]) {
  return {
    schemaVersion: 1,
    experiment: "ICE2-BASELINE",
    baselineSha: "a".repeat(40),
    browser: "149.0",
    platform: "linux",
    arch: "x64",
    loadMode: "indexeddb-revision-restore",
    traceEnabled: false,
    scenario: {
      name,
      strokes,
      visibleStrokes,
      dpr: 2,
      gifs: 0,
      cold: true,
      zOrder: "trailing",
      staticHeavy: true,
      iceBaseline: true,
    },
    fixture: {
      workloadVersion: 1,
      strokeGeometry: "varied",
      documentSha256: strokes.toString(16).padStart(64, "0"),
      mediaSha256: "b".repeat(64),
    },
    content: {
      objects: strokes + 10,
      pngCount: 4,
      jpegCount: 6,
      realGifFrames: 0,
      pngWidthPx: 1536,
      pngHeightPx: 1536,
    },
    before: {
      layers: 1,
      animatedLayers: 0,
      visibleObjects: visibleStrokes + 10,
      camera: { zoom: 1, offsetX: 0, offsetY: 0 },
    },
    after: {
      layers: 1,
      animatedLayers: 0,
      visibleObjects: visibleStrokes + 10,
      camera: { zoom: 1.04, offsetX: 12, offsetY: 17 },
    },
    inputTimesMs: Array.from({ length: 18 }, (_unused, index) => index),
    importDurationMs: 110,
    phases: {
      active: phase(75),
      commit: phase(12, 55),
      settling: phase(15, 30),
    },
  };
}

function matrix(includeLarge = false) {
  const specs = includeLarge ? [...cases, ...largeCases] : cases;
  return new Map(specs.map((spec) => [spec[0], makeReport(spec)]));
}

function log(m) {
  return [...m.values()]
    .map((report) => "ICE2_BASELINE " + JSON.stringify(report))
    .join("\n");
}

describe("ICE 2.0 baseline report integrity", () => {
  it("reads the fixed matrix and summarizes independent runs", () => {
    expect(parseIceBaselineLog(log(matrix())).size).toBe(4);
    const summary = summarizeIceBaseline([matrix(), matrix(), matrix()]);
    const variant = summary.variants["ice2-10000-static"];
    expect(summary.kind).toBe("ice2-trace-off-descriptive-baseline");
    expect(variant.activeFrames).toBe(225);
    expect(variant.medianActiveP95Ms).toBe(35);
    expect(variant.p99Evidence).toBe("insufficient-independent-samples");
    expect(variant.perRun).toHaveLength(3);
  });

  it("rejects missing, duplicate and unknown scenarios", () => {
    const entries = [...matrix().values()];
    expect(() =>
      parseIceBaselineLog(
        entries
          .slice(1)
          .map((item) => "ICE2_BASELINE " + JSON.stringify(item))
          .join("\n"),
      ),
    ).toThrow(/Incomplete/u);
    expect(() =>
      parseIceBaselineLog(
        log(matrix()) + "\nICE2_BASELINE " + JSON.stringify(entries[0]),
      ),
    ).toThrow(/Duplicate/u);
    const invalid = matrix();
    invalid.get("ice2-3000-static").scenario.name = "other";
    expect(() => parseIceBaselineLog(log(invalid))).toThrow(/Unexpected/u);
  });

  it("rejects fixture drift and source drift between repeats", () => {
    const alteredFixture = matrix();
    alteredFixture.get("ice2-5000-static").fixture.mediaSha256 = "c".repeat(64);
    expect(() =>
      summarizeIceBaseline([matrix(), alteredFixture, matrix()]),
    ).toThrow(/Fixture\/media SHA-256 drift/u);

    const alteredSource = matrix();
    alteredSource.get("ice2-1000-static").baselineSha = "d".repeat(40);
    expect(() =>
      summarizeIceBaseline([matrix(), alteredSource, matrix()]),
    ).toThrow(/Source SHA/u);
  });

  it("rejects a different camera path and unexpected visible membership", () => {
    const moved = matrix();
    moved.get("ice2-5000-static").after.camera.offsetX = 50;
    expect(() => summarizeIceBaseline([matrix(), moved, matrix()])).toThrow(
      /Camera \/ actual visible membership drift/u,
    );
    const invalidCount = matrix();
    invalidCount.get("ice2-3000-static").before.visibleObjects = 0;
    expect(() =>
      summarizeIceBaseline([matrix(), invalidCount, matrix()]),
    ).toThrow(/actual visible object count/u);
  });

  it("rejects trace-on, invalid phase statistics and missing inputs", () => {
    const traced = matrix();
    traced.get("ice2-3000-static").traceEnabled = true;
    expect(() => summarizeIceBaseline([matrix(), traced, matrix()])).toThrow(
      /trace-off/u,
    );
    const badPhase = matrix();
    badPhase.get("ice2-10000-static").phases.active.p99Ms = 1;
    expect(() => summarizeIceBaseline([matrix(), badPhase, matrix()])).toThrow(
      /percentile ordering/u,
    );
    const missingInput = matrix();
    missingInput.get("ice2-1000-static").inputTimesMs.pop();
    expect(() =>
      summarizeIceBaseline([matrix(), missingInput, matrix()]),
    ).toThrow(/Missing wheel inputs/u);
  });

  it("requires an explicit opt-in for 30k/100k cases", () => {
    const extended = matrix(true);
    expect(() => parseIceBaselineLog(log(extended))).toThrow(/Unexpected/u);
    expect(
      parseIceBaselineLog(log(extended), { includeLarge: true }).size,
    ).toBe(6);
    const summary = summarizeIceBaseline(
      [matrix(true), matrix(true), matrix(true)],
      { includeLarge: true },
    );
    expect(summary.variants["ice2-100000-offscreen"].strokes).toBe(100000);
  });

  it("refuses a single-run performance claim", () => {
    expect(() => summarizeIceBaseline([matrix()])).toThrow(
      /three independent/u,
    );
  });
});
