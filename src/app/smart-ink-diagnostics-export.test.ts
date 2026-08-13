import { describe, expect, it } from "vitest";

import { parseSmartInkCorpus } from "../modules/smart-ink-spike/public";
import type { SmartInkDiagnosticRecord } from "../modules/smart-ink/public";
import {
  createSmartInkDiagnosticExport,
  detectSmartInkBrowser,
  smartInkDiagnosticFilename,
} from "./smart-ink-diagnostics-export";

const recognizedLine: SmartInkDiagnosticRecord = {
  outcome: "proposed",
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
  ],
  reason: "proposal-created",
  recognizer: {
    candidates: [
      {
        confidence: 0.98,
        diagnostics: {
          closedness: 0,
          endpointEfficiency: 1,
          normalizedResidual: 0,
        },
        fitError: 0.02,
        geometry: {
          end: { x: 100, y: 0 },
          kind: "line",
          start: { x: 0, y: 0 },
        },
        kind: "line",
      },
    ],
    diagnostics: [],
    recognizerVersion: "tutorboard.smart-ink-geometric/0.5-spike",
    sampledPointCount: 96,
    schemaVersion: "tutorboard.smart-ink-proposal/0.1-spike",
    sourceStrokeId: "object:diagnostic-line",
    status: "recognized",
  },
  replacementKind: "drawing.line",
  schemaVersion: "tutorboard.smart-ink-diagnostic/0.1",
  selectedCandidateKind: "line",
  sourcePointCount: 2,
};

describe("Smart Ink diagnostic export", () => {
  it("creates a corpus-compatible unreviewed capture", () => {
    const exported = createSmartInkDiagnosticExport(recognizedLine, {
      browser: "firefox",
      capturedAt: "2026-07-30T17:30:00.000Z",
      durationMs: 420,
      pointerType: "pen",
    });

    expect(() => parseSmartInkCorpus(exported)).not.toThrow();
    expect(exported.samples[0]).toMatchObject({
      acceptableKinds: ["line"],
      expectedKind: "line",
      metadata: {
        browser: "firefox",
        deviceProfile: "other-device",
        durationMs: 420,
        pointerType: "pen",
      },
      provenance: "captured",
      shouldPropose: true,
    });
    expect(exported.captureDiagnostics).toMatchObject({
      labelStatus: "unreviewed",
      outcome: "proposed",
      selectedCandidateKind: "line",
    });
  });

  it("detects supported browsers and creates stable filenames", () => {
    expect(detectSmartInkBrowser("Mozilla/5.0 Firefox/153.0")).toBe("firefox");
    expect(detectSmartInkBrowser("Mozilla/5.0 Chrome/140.0")).toBe("chromium");
    expect(detectSmartInkBrowser("custom-agent")).toBe("other");
    expect(smartInkDiagnosticFilename("2026-07-30T17:30:00.000Z")).toBe(
      "smart-ink-diagnostic-2026-07-30T17-30-00-000Z.json",
    );
  });

  it("exports extended arrow evidence without changing the v0.1 corpus", () => {
    const exported = createSmartInkDiagnosticExport(
      {
        ...recognizedLine,
        replacementKind: "drawing.pen-stroke",
        selectedCandidateKind: "arrow",
      },
      {
        browser: "chromium",
        capturedAt: "2026-08-04T10:00:00.000Z",
        durationMs: 360,
        pointerType: "mouse",
      },
    );

    expect(exported).toMatchObject({
      captureDiagnostics: { selectedCandidateKind: "arrow" },
      samples: [
        {
          acceptableKinds: ["arrow"],
          expectedKind: "arrow",
          shouldPropose: true,
        },
      ],
      schemaVersion: "tutorboard.smart-ink-extended-corpus/0.1",
    });
  });
});
