import type { Vec2 } from "../../../core/public";
import type { SmartInkV2Decision, SmartInkV2Kind } from "./types";

export const smartInkV2GoldQualityTargets = {
  calibrationEceMaximum: 0.03,
  falsePositiveRateMaximum: 0.005,
  hardNegativeFalsePositiveRateMaximum: 0.01,
  macroPrecisionMinimum: 0.985,
  macroRecallMinimum: 0.96,
  p95LatencyMsMaximum: 12,
  p99LatencyMsMaximum: 20,
  perClassPrecisionMinimum: 0.975,
  perClassRecallMinimum: 0.94,
  unrecognizedPositiveRateMaximum: 0.07,
  wrongAutoAcceptRateMaximum: 0.003,
} as const;

export interface SmartInkV2ShadowDiagnostic {
  readonly legacyKind: string | null;
  readonly v2Kind: SmartInkV2Kind;
  readonly v2Status: SmartInkV2Decision["status"];
}

const shadowListeners = new Set<(value: SmartInkV2ShadowDiagnostic) => void>();

export function recordSmartInkV2ShadowDiagnostic(
  decision: SmartInkV2Decision,
): void {
  const diagnostic: SmartInkV2ShadowDiagnostic = {
    legacyKind: decision.legacyProposal.candidates[0]?.kind ?? null,
    v2Kind: decision.selectedKind,
    v2Status: decision.status,
  };
  for (const listener of shadowListeners) listener(diagnostic);
}

export function subscribeSmartInkV2ShadowDiagnostics(
  listener: (value: SmartInkV2ShadowDiagnostic) => void,
): () => void {
  shadowListeners.add(listener);
  return () => shadowListeners.delete(listener);
}

export function createSmartInkHardNegativeFixtures(): readonly (readonly Vec2[])[] {
  return [
    [
      { x: 0, y: 0 },
      { x: 30, y: 20 },
      { x: 4, y: 42 },
      { x: 34, y: 60 },
      { x: 7, y: 82 },
    ],
    [
      { x: 0, y: 30 },
      { x: 20, y: 0 },
      { x: 40, y: 30 },
      { x: 20, y: 60 },
      { x: 0, y: 30 },
      { x: 40, y: 30 },
    ],
  ];
}

export function transformSmartInkMetamorphic(
  points: readonly Vec2[],
  options: {
    readonly rotation: number;
    readonly scale: number;
    readonly x: number;
    readonly y: number;
  },
): readonly Vec2[] {
  const cosine = Math.cos(options.rotation);
  const sine = Math.sin(options.rotation);
  return points.map((point) => ({
    x: (point.x * cosine - point.y * sine) * options.scale + options.x,
    y: (point.x * sine + point.y * cosine) * options.scale + options.y,
  }));
}
