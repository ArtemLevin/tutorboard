import type { ReactElement } from "react";

import type {
  SolidSectionResult,
  SolidTopology,
} from "../../core/public";

export interface Solid3DSectionRotationControlsProps {
  readonly topology: SolidTopology | null;
  readonly hasSourcePlane: boolean;
  readonly enabled: boolean;
  readonly onEnabledChange: (enabled: boolean) => void;
  readonly edgeId: string;
  readonly onEdgeChange: (edgeId: string) => void;
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
  edgeId,
  onEdgeChange,
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
    <section
      aria-label="Вращение секущей плоскости"
      className="solid-3d-sweep"
    >
      <h3>Вращение секущей плоскости</h3>
      {topology === null || !hasSourcePlane ? (
        <p>Выберите три неколлинеарные точки многогранника.</p>
      ) : (
        <>
          <label>
            <input
              checked={enabled}
              onChange={(event) => onEnabledChange(event.currentTarget.checked)}
              type="checkbox"
            />
            Вращать плоскость вокруг ребра
          </label>
          {enabled ? (
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
              <p>Вращение происходит вокруг прямой выбранного ребра.</p>
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
                {edgeId === ""
                  ? "Выберите ребро для оси вращения"
                  : section === null
                    ? "Плоскость не образует сечение тела"
                    : `Вершин ${section.vertices.length} · площадь ${section.area.toFixed(2)} · периметр ${section.perimeter.toFixed(2)}`}
              </p>
              <button
                disabled={!canSave}
                onClick={onSave}
                type="button"
              >
                Сохранить повёрнутое сечение
              </button>
            </>
          ) : null}
        </>
      )}
    </section>
  );
}
