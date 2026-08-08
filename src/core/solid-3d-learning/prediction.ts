import {
  distance3,
  type SolidSectionResult,
  type SolidTopology,
} from "../solid-3d/public";
import type { SolidSectionPrediction } from "./types";

const polygonAliases: Readonly<Record<string, string>> = {
  "3": "triangle",
  triangle: "triangle",
  треугольник: "triangle",
  "4": "quadrilateral",
  quadrilateral: "quadrilateral",
  четырехугольник: "quadrilateral",
  четырёхугольник: "quadrilateral",
  "5": "pentagon",
  pentagon: "pentagon",
  пятиугольник: "pentagon",
  "6": "hexagon",
  hexagon: "hexagon",
  шестиугольник: "hexagon",
};

export function polygonKindForVertexCount(count: number): string {
  return count === 3
    ? "triangle"
    : count === 4
      ? "quadrilateral"
      : count === 5
        ? "pentagon"
        : count === 6
          ? "hexagon"
          : `${String(count)}-gon`;
}

export function normalizePolygonKind(value: string): string {
  const normalized = value.trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
  return polygonAliases[normalized] ?? normalized;
}

function sectionEdgeIds(
  topology: SolidTopology,
  section: SolidSectionResult,
): readonly string[] {
  const vertices = new Map(
    topology.vertices.map((item) => [item.id, item.position]),
  );
  return topology.edges.flatMap((edge) => {
    const start = vertices.get(edge.startVertexId)!;
    const end = vertices.get(edge.endVertexId)!;
    const total = distance3(start, end);
    const contains = section.vertices.some(
      (point) =>
        Math.abs(distance3(start, point) + distance3(point, end) - total) <=
        1e-5,
    );
    return contains ? [edge.id] : [];
  });
}

export interface SolidPredictionComparison {
  readonly score: number;
  readonly correctVertexCount: number;
  readonly correctPolygonKind: string;
  readonly correctEdgeIds: readonly string[];
  readonly missingEdgeIds: readonly string[];
  readonly extraEdgeIds: readonly string[];
}

export function compareSolidSectionPrediction(
  prediction: SolidSectionPrediction,
  topology: SolidTopology | null,
  section: SolidSectionResult,
): SolidPredictionComparison {
  const correctEdgeIds =
    topology === null ? [] : sectionEdgeIds(topology, section);
  const predictedEdges = [...new Set(prediction.edgeIds)].sort();
  const missingEdgeIds = correctEdgeIds.filter(
    (id) => !predictedEdges.includes(id),
  );
  const extraEdgeIds = predictedEdges.filter(
    (id) => !correctEdgeIds.includes(id),
  );
  const countScore = prediction.vertexCount === section.vertices.length ? 1 : 0;
  const correctPolygonKind = polygonKindForVertexCount(section.vertices.length);
  const kindScore =
    normalizePolygonKind(prediction.polygonKind) === correctPolygonKind ? 1 : 0;
  const edgeScore =
    correctEdgeIds.length === 0
      ? 1
      : Math.max(
          0,
          1 -
            (missingEdgeIds.length + extraEdgeIds.length) /
              correctEdgeIds.length,
        );
  return {
    correctEdgeIds,
    correctPolygonKind,
    correctVertexCount: section.vertices.length,
    extraEdgeIds,
    missingEdgeIds,
    score: (countScore + kindScore + edgeScore) / 3,
  };
}
