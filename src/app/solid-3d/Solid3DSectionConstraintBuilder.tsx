import { useMemo, useState, type ReactElement } from "react";

import {
  analyticSurfaceIds,
  createSolidTopology,
  isPlanarAnalyticSurfaceId,
  isSolidSectionHelperPoint,
  type Solid3DRecord,
  type SolidSectionConstraint,
} from "../../core/public";
import { saveConstrainedSolidSection } from "../../modules/solid-3d/public";
import "./Solid3DSectionConstraintBuilder.css";

export interface Solid3DSectionConstraintBuilderProps {
  readonly onRecordChange: (replacement: Solid3DRecord) => void;
  readonly onSectionCreated: (sectionId: string) => void;
  readonly readOnly: boolean;
  readonly record: Solid3DRecord;
}

type ConstraintMode =
  | "edge-point"
  | "parallel-face"
  | "parallel-surface"
  | "perpendicular-edge";

const modeLabels: Readonly<Record<ConstraintMode, string>> = {
  "edge-point": "Через ребро и точку",
  "parallel-face": "Через точку параллельно грани",
  "parallel-surface": "Через точку параллельно основанию",
  "perpendicular-edge": "Через точку перпендикулярно ребру",
};

function errorMessage(code: string): string {
  switch (code) {
    case "solid.section.points-missing":
      return "Выбранная точка отсутствует.";
    case "solid.section.collinear":
      return "Условие даёт вырожденную плоскость.";
    case "solid.section.outside":
      return "Плоскость не пересекает тело или условие недоступно для этого тела.";
    default:
      return "Сечение построить не удалось.";
  }
}

export function Solid3DSectionConstraintBuilder({
  onRecordChange,
  onSectionCreated,
  readOnly,
  record,
}: Solid3DSectionConstraintBuilderProps): ReactElement {
  const topology = useMemo(
    () => createSolidTopology(record.definition),
    [record.definition],
  );
  const points = record.points.filter((point) => !isSolidSectionHelperPoint(point));
  const planarSurfaces = analyticSurfaceIds(record.definition).filter(
    isPlanarAnalyticSurfaceId,
  );
  const initialMode: ConstraintMode =
    topology === null ? "parallel-surface" : "edge-point";
  const [mode, setMode] = useState<ConstraintMode>(initialMode);
  const [pointId, setPointId] = useState(points[0]?.id ?? "");
  const [referenceId, setReferenceId] = useState(
    topology?.edges[0]?.id ?? planarSurfaces[0] ?? "",
  );
  const [error, setError] = useState<string | null>(null);

  const availableModes = (
    topology === null
      ? (["parallel-surface"] as const)
      : (["edge-point", "parallel-face", "perpendicular-edge"] as const)
  ) satisfies readonly ConstraintMode[];
  const references =
    mode === "parallel-face"
      ? (topology?.faces ?? []).map(({ id }) => id)
      : mode === "parallel-surface"
        ? planarSurfaces
        : (topology?.edges ?? []).map(({ id }) => id);

  const switchMode = (next: ConstraintMode): void => {
    setMode(next);
    const nextReferences =
      next === "parallel-face"
        ? (topology?.faces ?? []).map(({ id }) => id)
        : next === "parallel-surface"
          ? planarSurfaces
          : (topology?.edges ?? []).map(({ id }) => id);
    setReferenceId(nextReferences[0] ?? "");
    setError(null);
  };

  const createConstraint = (): void => {
    if (pointId.length === 0 || referenceId.length === 0) return;
    const constraint: SolidSectionConstraint =
      mode === "edge-point"
        ? { edgeId: referenceId, kind: "through-edge-and-point", pointId }
        : mode === "parallel-face"
          ? {
              faceId: referenceId,
              kind: "through-point-parallel-face",
              pointId,
            }
          : mode === "perpendicular-edge"
            ? {
                edgeId: referenceId,
                kind: "through-point-perpendicular-edge",
                pointId,
              }
            : {
                kind: "through-point-parallel-surface",
                pointId,
                surfaceId: referenceId,
              };
    const result = saveConstrainedSolidSection({
      constraint,
      record,
      token: crypto.randomUUID(),
    });
    if (result.status === "error") {
      setError(errorMessage(result.code));
      return;
    }
    setError(null);
    onRecordChange(result.record);
    onSectionCreated(result.sectionId);
  };

  return (
    <section
      aria-labelledby="solid-3d-constraint-title"
      className="solid-3d-constraint-builder"
    >
      <h3 id="solid-3d-constraint-title">Плоскость по условию</h3>
      {points.length === 0 ? (
        <p>Сначала поставьте хотя бы одну точку на модели.</p>
      ) : (
        <>
          <label>
            <span>Условие</span>
            <select
              aria-label="Условие плоскости"
              disabled={readOnly}
              onChange={(event) =>
                switchMode(event.currentTarget.value as ConstraintMode)
              }
              value={mode}
            >
              {availableModes.map((item) => (
                <option key={item} value={item}>
                  {modeLabels[item]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Через точку</span>
            <select
              aria-label="Точка плоскости"
              disabled={readOnly}
              onChange={(event) => setPointId(event.currentTarget.value)}
              value={pointId}
            >
              {points.map((point) => (
                <option key={point.id} value={point.id}>
                  {point.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>
              {mode === "parallel-face"
                ? "Грань"
                : mode === "parallel-surface"
                  ? "Основание"
                  : "Ребро"}
            </span>
            <select
              aria-label="Опорный элемент плоскости"
              disabled={readOnly}
              onChange={(event) => setReferenceId(event.currentTarget.value)}
              value={referenceId}
            >
              {references.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={readOnly || references.length === 0}
            onClick={createConstraint}
            type="button"
          >
            Создать constrained-сечение
          </button>
        </>
      )}
      {error === null ? null : (
        <p className="solid-3d-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
