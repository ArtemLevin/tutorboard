import {
  createSolidTopology,
  resolveSolidPointAnchor,
  type Solid3DPoint,
  type Solid3DRecord,
} from "../solid-3d/public";
import type { SolidLearningCheckpoint } from "./types";
import { calculateSectionForLearning } from "./section";

export interface DynamicSectionSample {
  readonly parameter: number;
  readonly area: number;
  readonly perimeter: number;
  readonly vertexCount: number;
  readonly critical: boolean;
}

export function moveAnchoredPoint(
  record: Solid3DRecord,
  pointId: string,
  parameter: number,
): Solid3DRecord {
  const topology = createSolidTopology(record.definition);
  if (topology === null) return record;
  const point = record.points.find(({ id }) => id === pointId);
  if (point?.anchor.kind !== "edge") return record;
  const anchor = {
    ...point.anchor,
    parameter: Math.min(1, Math.max(0, parameter)),
  } as const;
  const position = resolveSolidPointAnchor(topology, anchor);
  if (position === null) return record;
  return {
    ...record,
    points: record.points.map((candidate): Solid3DPoint =>
      candidate.id === point.id
        ? { ...candidate, anchor, position }
        : candidate,
    ),
  };
}

export function sampleDynamicSection(
  record: Solid3DRecord,
  pointId: string,
  pointIds: readonly [string, string, string],
  sampleCount = 41,
): readonly DynamicSectionSample[] {
  const samples = Array.from({ length: sampleCount }, (_, index) => {
    const parameter = sampleCount === 1 ? 0 : index / (sampleCount - 1);
    const moved = moveAnchoredPoint(record, pointId, parameter);
    const section = calculateSectionForLearning(moved, pointIds);
    return {
      area: section?.area ?? 0,
      critical: false,
      parameter,
      perimeter: section?.perimeter ?? 0,
      vertexCount: section?.vertices.length ?? 0,
    };
  });
  return samples.map((sample, index) => ({
    ...sample,
    critical:
      index > 0 && samples[index - 1]!.vertexCount !== sample.vertexCount,
  }));
}

export function checkpointFromSample(
  sample: DynamicSectionSample,
  timestamp: string,
): SolidLearningCheckpoint {
  return { ...sample, timestamp };
}
