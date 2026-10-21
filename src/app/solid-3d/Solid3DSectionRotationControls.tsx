import type { ReactElement } from "react";

import type {
  Solid3DPoint,
  SolidSectionResult,
  SolidTopology,
} from "../../core/public";

export interface Solid3DSectionRotationControlsProps {
  readonly topology: SolidTopology | null;
  readonly hasSourcePlane: boolean;
  readonly enabled: boolean;
  readonly onEnabledChange: (enabled: boolean) => void;
  readonly axisKind: "edge" | "points";
  readonly onAxisKindChange: (kind: "edge" | "points") => void;
  readonly edgeId: string;
  readonly onEdgeChange: (edgeId: string) => void;
  readonly points: readonly Solid3DPoint[];
  readonly axisPointIds: readonly [Solid3DPoint["id"] | "", Solid3DPoint["id"] | ""];
  readonly onAxisPointChange: (index: 0 | 1, id: Solid3DPoint["id"] | "") => void;
  readonly angleDegrees: number;
  readonly onAngleChange: (angle: number) => void;
  readonly section: SolidSectionResult | null;
  readonly canSave: boolean;
  readonly onSave: () => void;
}

export function Solid3DSectionRotationControls({
  topology,
  hasSourcePlane,
  enabled,
  onEnabledChange,
  axisKind,
  onAxisKindChange,
  edgeId,
  onEdgeChange,
  points,
  axisPointIds,
  onAxisPointChange,
  angleDegrees,
  onAngleChange,
  section,
  canSave,
  onSave,
}: Solid3DSectionRotationControlsProps): ReactElement {
  const vertexLabels = new Map(
    topology?.vertices.map((vertex) => [vertex.id, vertex.label]) ?? [],
  );
  return (
    <section aria-label="Вращение секущей плоскости" className="solid-3d-sweep">
      <h3>Вращение секущей плоскости</h3>
      {topology === null || !hasSourcePlane ? (
        <p>
          Выберите три неколлинеарные точки выпуклого многогранника. Вогнутые
          тела и неплоские грани пока не поддерживаются.
        </p>
      ) : (
        <>
          <label>
            <input
              checked={enabled}
              onChange={(event) => onEnabledChange(event.currentTarget.checked)}
              type="checkbox"
            />
            {axisKind === "edge"
              ? "Вращать плоскость вокруг ребра"
              : "Вращать плоскость вокруг двух точек"}
          </label>
          {enabled ? (
            <>
              <label htmlFor="solid-3d-rotation-kind">Тип оси вращения</label>
              <select
                id="solid-3d-rotation-kind"
                onChange={(event) =>
                  onAxisKindChange(event.currentTarget.value as "edge" | "points")
                }
                value={axisKind}
              >
                <option value="edge">Ребро многогранника</option>
                <option value="points">Две точки модели</option>
              </select>
              {axisKind === "edge" ? (
                <>
                  <label htmlFor="solid-3d-rotation-edge">Ось вращения</label>
                  <select
                    id="solid-3d-rotation-edge"
                    onChange={(event) => onEdgeChange(event.currentTarget.value)}
                    value={edgeId}
                  >
                    <option value="">Выберите ребро</option>
                    {topology.edges.map((edge) => (
                      <option key={edge.id} value={edge.id}>
                        {vertexLabels.get(edge.startVertexId) ?? "?"}—
                        {vertexLabels.get(edge.endVertexId) ?? "?"}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <>
                  {([0, 1] as const).map((index) => (
                    <label key={index}>
                      {index === 0 ? "Первая точка оси" : "Вторая точка оси"}
                      <select
                        aria-label={
                          index === 0 ? "Первая точка оси" : "Вторая точка оси"
                        }
                        onChange={(event) =>
                          onAxisPointChange(
                            index,
                            event.currentTarget.value as Solid3DPoint["id"] | "",
                          )
                        }
                        value={axisPointIds[index]}
                      >
                        <option value="">Выберите точку</option>
                        {points.map((point) => (
                          <option key={point.id} value={point.id}>
                            {point.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </>
              )}
              <p>
                {axisKind === "edge"
                  ? "Вращение происходит вокруг прямой выбранного ребра."
                  : "Ось проходит через две разные точки модели; она показана пунктиром."}
              </p>
              <label htmlFor="solid-3d-rotation-slider">
                Угол вращения: {angleDegrees.toFixed(1)}°
              </label>
              <input
                aria-label="Угол поворота секущей плоскости"
                id="solid-3d-rotation-slider"
                max={180}
                min={-180}
                onChange={(event) =>
                  onAngleChange(Number(event.currentTarget.value))
                }
                step={0.1}
                type="range"
                value={angleDegrees}
              />
              <label htmlFor="solid-3d-rotation-exact">
                Точный угол, градусы
              </label>
              <input
                id="solid-3d-rotation-exact"
                max={180}
                min={-180}
                onChange={(event) =>
                  onAngleChange(Number(event.currentTarget.value))
                }
                step={0.1}
                type="number"
                value={angleDegrees}
              />
              <div
                aria-label="Шаговые изменения угла"
                className="solid-3d-rotation-angle-actions"
                role="group"
              >
                {[-15, -5, -1, 1, 5, 15].map((delta) => (
                  <button
                    aria-label={`Изменить угол на ${delta > 0 ? "+" : ""}${delta}°`}
                    key={delta}
                    onClick={() => onAngleChange(angleDegrees + delta)}
                    type="button"
                  >
                    {delta > 0 ? "+" : ""}
                    {delta}°
                  </button>
                ))}
              </div>
              <p aria-live="polite">
                {axisKind === "edge" && edgeId === ""
                  ? "Выберите ребро для оси вращения"
                  : axisKind === "points" &&
                      (axisPointIds[0] === "" || axisPointIds[1] === "")
                    ? "Выберите две точки оси вращения"
                    : axisKind === "points" && axisPointIds[0] === axisPointIds[1]
                      ? "Для оси требуются две разные точки"
                      : section === null
                        ? "Плоскость не образует сечение тела или ось вырождена"
                        : `Вершин ${section.vertices.length} · площадь ${section.area.toFixed(2)} · периметр ${section.perimeter.toFixed(2)}`}
              </p>
              <button disabled={!canSave} onClick={onSave} type="button">
                Сохранить повёрнутое сечение
              </button>
            </>
          ) : null}
        </>
      )}
    </section>
  );
}
