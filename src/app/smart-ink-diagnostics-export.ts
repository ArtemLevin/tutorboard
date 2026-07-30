import {
  smartInkCorpusSchemaVersion,
  type SmartInkCorpus,
  type SmartInkCorpusBrowser,
  type SmartInkCorpusDeviceProfile,
  type SmartInkCorpusPointerType,
  type SmartInkPrimitiveKind,
} from "../modules/smart-ink-spike/public";
import {
  smartInkCanvasRecognitionPolicy,
  type SmartInkDiagnosticRecord,
} from "../modules/smart-ink/public";

const maximumExportPointCount = 4_096;

export interface SmartInkPointerMetadata {
  readonly durationMs: number;
  readonly pointerType: SmartInkCorpusPointerType;
}

export interface SmartInkDiagnosticExportMetadata extends SmartInkPointerMetadata {
  readonly browser: SmartInkCorpusBrowser;
  readonly capturedAt: string;
  readonly deviceProfile?: SmartInkCorpusDeviceProfile;
}

export interface SmartInkDiagnosticExport extends SmartInkCorpus {
  readonly captureDiagnostics: {
    readonly exportedAt: string;
    readonly labelStatus: "unreviewed";
    readonly outcome: SmartInkDiagnosticRecord["outcome"];
    readonly policy: typeof smartInkCanvasRecognitionPolicy;
    readonly reason: SmartInkDiagnosticRecord["reason"];
    readonly recognizerResult: SmartInkDiagnosticRecord["recognizer"];
    readonly replacementKind: SmartInkDiagnosticRecord["replacementKind"];
    readonly selectedCandidateKind: SmartInkPrimitiveKind | null;
    readonly sourcePointCount: number;
  };
}

function boundedPoints(
  points: SmartInkDiagnosticRecord["points"],
): SmartInkDiagnosticRecord["points"] {
  if (points.length <= maximumExportPointCount) {
    return points.map((point) => ({ ...point }));
  }
  return Array.from({ length: maximumExportPointCount }, (_, index) => {
    const sourceIndex = Math.round(
      (index * (points.length - 1)) / (maximumExportPointCount - 1),
    );
    return { ...points[sourceIndex]! };
  });
}

function sampleId(
  record: SmartInkDiagnosticRecord,
  capturedAt: string,
): string {
  const timestamp = capturedAt.replace(/[^0-9]/gu, "").slice(0, 17);
  const source = record.recognizer.sourceStrokeId
    .replace(/[^a-zA-Z0-9_-]/gu, "-")
    .slice(-72);
  return `captured-${timestamp}-${source}`.slice(0, 160);
}

export function detectSmartInkBrowser(
  userAgent: string,
): SmartInkCorpusBrowser {
  if (/firefox/iu.test(userAgent)) {
    return "firefox";
  }
  if (/chrom(?:e|ium)|edg/iu.test(userAgent)) {
    return "chromium";
  }
  return "other";
}

export function createSmartInkDiagnosticExport(
  record: SmartInkDiagnosticRecord,
  metadata: SmartInkDiagnosticExportMetadata,
): SmartInkDiagnosticExport {
  const positive =
    record.outcome === "proposed" && record.selectedCandidateKind !== null;
  const expectedKind = positive
    ? record.selectedCandidateKind!
    : ("negative" as const);
  const acceptableKinds: readonly SmartInkPrimitiveKind[] = positive
    ? [record.selectedCandidateKind!]
    : [];

  return {
    captureDiagnostics: {
      exportedAt: metadata.capturedAt,
      labelStatus: "unreviewed",
      outcome: record.outcome,
      policy: smartInkCanvasRecognitionPolicy,
      reason: record.reason,
      recognizerResult: record.recognizer,
      replacementKind: record.replacementKind,
      selectedCandidateKind: record.selectedCandidateKind,
      sourcePointCount: record.sourcePointCount,
    },
    samples: [
      {
        acceptableKinds,
        expectedKind,
        id: sampleId(record, metadata.capturedAt),
        metadata: {
          browser: metadata.browser,
          deviceProfile: metadata.deviceProfile ?? "other-device",
          durationMs: Math.max(0, Math.round(metadata.durationMs)),
          pointerType: metadata.pointerType,
        },
        points: boundedPoints(record.points),
        provenance: "captured",
        shouldPropose: positive,
      },
    ],
    schemaVersion: smartInkCorpusSchemaVersion,
  };
}

export function smartInkDiagnosticFilename(capturedAt: string): string {
  return `smart-ink-diagnostic-${capturedAt.replace(/[:.]/gu, "-")}.json`;
}

export function downloadSmartInkDiagnostic(
  diagnostic: SmartInkDiagnosticExport,
  filename: string,
): void {
  const blob = new Blob([`${JSON.stringify(diagnostic, null, 2)}\n`], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.download = filename;
  anchor.href = url;
  anchor.click();
  URL.revokeObjectURL(url);
}
