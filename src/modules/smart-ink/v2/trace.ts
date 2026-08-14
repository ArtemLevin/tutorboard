import type { PenStrokeObject, Vec2 } from "../../../core/public";
import { resolveVectorInkData } from "../../../core/public";
import type { SmartInkTrace, SmartInkTracePoint } from "./types";

const fallbackIntervalMs = 8;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function createSmartInkTrace(
  stroke: PenStrokeObject,
  worldPoints: readonly Vec2[],
  pointerType: SmartInkTrace["pointerType"] = "unknown",
): SmartInkTrace {
  const samples = resolveVectorInkData(stroke).samples;
  const points: SmartInkTracePoint[] = worldPoints.map((point, index) => {
    const sample = samples[Math.min(index, Math.max(0, samples.length - 1))];
    return {
      x: point.x,
      y: point.y,
      pressure: clamp01(sample?.pressure ?? 0.5),
      timestampMs: sample?.timestampMs ?? index * fallbackIntervalMs,
    };
  });
  return { pointerType, points, sourceStrokeId: stroke.id };
}

export function traceDurationMs(trace: SmartInkTrace): number {
  const first = trace.points[0];
  const last = trace.points.at(-1);
  return first === undefined || last === undefined
    ? 0
    : Math.max(0, last.timestampMs - first.timestampMs);
}
