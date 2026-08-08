import {
  distance3,
  type SolidSectionResult,
  type SolidTopology,
  type Vec3,
} from "../solid-3d/public";
import type {
  SolidConstructionAction,
  SolidLearningDiagnosticCode,
} from "./types";

export interface SectionGraphPoint {
  readonly id: string;
  readonly position: Vec3;
  readonly edgeIds: readonly string[];
}
export interface SectionGraphSegment {
  readonly id: string;
  readonly faceId: string;
  readonly fromPointId: string;
  readonly toPointId: string;
}
export interface SectionConstructionGraph {
  readonly points: readonly SectionGraphPoint[];
  readonly segments: readonly SectionGraphSegment[];
  readonly cycle: readonly string[];
}

function pointOnEdge(
  point: Vec3,
  start: Vec3,
  end: Vec3,
  epsilon = 1e-5,
): boolean {
  return (
    Math.abs(
      distance3(start, point) + distance3(point, end) - distance3(start, end),
    ) <= epsilon
  );
}

export function buildSectionConstructionGraph(
  topology: SolidTopology,
  section: SolidSectionResult,
): SectionConstructionGraph {
  const vertices = new Map(
    topology.vertices.map((item) => [item.id, item.position]),
  );
  const points = section.vertices.map((position, index): SectionGraphPoint => ({
    edgeIds: topology.edges.flatMap((edge) =>
      pointOnEdge(
        position,
        vertices.get(edge.startVertexId)!,
        vertices.get(edge.endVertexId)!,
      )
        ? [edge.id]
        : [],
    ),
    id: `section-point:${String(index)}`,
    position,
  }));
  const segments = points.flatMap((point, index) => {
    const next = points[(index + 1) % points.length]!;
    const face = topology.faces.find(
      (candidate) =>
        point.edgeIds.some((id) => candidate.edgeIds.includes(id)) &&
        next.edgeIds.some((id) => candidate.edgeIds.includes(id)),
    );
    return face === undefined
      ? []
      : [
          {
            faceId: face.id,
            fromPointId: point.id,
            id: `section-segment:${String(index)}`,
            toPointId: next.id,
          },
        ];
  });
  return { cycle: points.map(({ id }) => id), points, segments };
}

export function cyclesEquivalent(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length !== right.length || left.length === 0) return false;
  const candidates = [right, [...right].reverse()];
  return candidates.some((candidate) =>
    candidate.some((_, offset) =>
      left.every(
        (id, index) => id === candidate[(index + offset) % candidate.length],
      ),
    ),
  );
}

export interface ConstructionValidationResult {
  readonly accepted: boolean;
  readonly diagnosticCode: SolidLearningDiagnosticCode | null;
  readonly explanation: string;
}

export function validateConstructionAction(
  graph: SectionConstructionGraph,
  action: SolidConstructionAction,
): ConstructionValidationResult {
  if (action.kind === "select-face") {
    const accepted = graph.segments.some(
      ({ faceId }) => faceId === action.faceId,
    );
    return accepted
      ? {
          accepted: true,
          diagnosticCode: null,
          explanation: "Эта грань содержит след секущей плоскости.",
        }
      : {
          accepted: false,
          diagnosticCode: "points-on-different-faces",
          explanation:
            "На выбранной грани отсутствуют две соседние точки сечения.",
        };
  }
  if (action.kind === "add-derived-point") {
    if (action.parameter < 0 || action.parameter > 1)
      return {
        accepted: false,
        diagnosticCode: "point-outside-edge",
        explanation: "Параметр точки должен лежать от 0 до 1.",
      };
    const accepted = graph.points.some(({ edgeIds }) =>
      edgeIds.includes(action.edgeId),
    );
    return accepted
      ? {
          accepted: true,
          diagnosticCode: null,
          explanation: "Найдена точка перехода секущей плоскости через ребро.",
        }
      : {
          accepted: false,
          diagnosticCode: "missed-edge-intersection",
          explanation: "Это ребро секущая плоскость не пересекает.",
        };
  }
  if (action.kind === "add-trace-segment") {
    const accepted = graph.segments.some(
      (segment) =>
        segment.faceId === action.faceId &&
        ((segment.fromPointId === action.fromPointId &&
          segment.toPointId === action.toPointId) ||
          (segment.fromPointId === action.toPointId &&
            segment.toPointId === action.fromPointId)),
    );
    return accepted
      ? {
          accepted: true,
          diagnosticCode: null,
          explanation:
            "Точки лежат на одной грани, поэтому отрезок является её следом.",
        }
      : {
          accepted: false,
          diagnosticCode: "segment-outside-section-plane",
          explanation:
            "Выбранный отрезок не совпадает со следом плоскости на этой грани.",
        };
  }
  const accepted = cyclesEquivalent(action.orderedPointIds, graph.cycle);
  return accepted
    ? {
        accepted: true,
        diagnosticCode: null,
        explanation: "Контур замкнут в правильном порядке.",
      }
    : {
        accepted: false,
        diagnosticCode: "wrong-contour-order",
        explanation:
          new Set(action.orderedPointIds).size < action.orderedPointIds.length
            ? "В контуре повторяется вершина."
            : "Нарушен порядок обхода контура сечения.",
      };
}

export const diagnosticMessages: Readonly<
  Record<SolidLearningDiagnosticCode, string>
> = {
  "points-on-different-faces":
    "Сначала найдите грань, содержащую две соседние точки сечения.",
  "missed-edge-intersection":
    "Проверьте, через какое ребро след переходит на соседнюю грань.",
  "wrong-contour-order": "Обходите вершины последовательно по границе сечения.",
  "self-intersection": "Стороны сечения не должны пересекаться внутри контура.",
  "point-outside-edge": "Точка обязана лежать на выбранном ребре.",
  "segment-outside-section-plane":
    "Обе точки отрезка должны принадлежать секущей плоскости и одной грани.",
  "duplicate-or-collinear-seeds":
    "Выберите три различные точки, которые не лежат на одной прямой.",
  "invalid-proof-premises":
    "Для выбранного правила не хватает доказанных предпосылок.",
  "incorrect-formula":
    "Сопоставьте величину с формулой для полученного многоугольника.",
  "incorrect-unit": "Для длины, площади и объёма используются разные единицы.",
};

export function hintForDiagnostic(
  code: SolidLearningDiagnosticCode,
  level: 1 | 2 | 3,
  graph: SectionConstructionGraph,
): string {
  if (level === 1) return diagnosticMessages[code];
  const segment = graph.segments[0];
  if (level === 2)
    return segment === undefined
      ? "Исследуйте положение исходных точек."
      : `Обратите внимание на грань ${segment.faceId}.`;
  return segment === undefined
    ? "Измените положение одной исходной точки."
    : `Следующий допустимый след: ${segment.fromPointId} — ${segment.toPointId}.`;
}
