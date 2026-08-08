import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";

import {
  createSolidTopology,
  solidPointId,
  solidSectionId,
  type Solid3DPoint,
  type Solid3DRecord,
  type SolidPointAnchor,
  type SolidSectionResult,
  type Vec3,
} from "../../core/public";
import { calculateSolidSection } from "../../modules/solid-3d/public";
import { Solid3DViewport } from "../../adapters/solid-3d-three/public";
import "./Solid3DEditorPanel.css";

export interface Solid3DEditorPanelProps {
  readonly onClose: () => void;
  readonly onProject: (sectionId: string, section: SolidSectionResult) => void;
  readonly onRecordChange: (replacement: Solid3DRecord) => void;
  readonly onUndo: () => void;
  readonly readOnly: boolean;
  readonly record: Solid3DRecord;
}

const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const solidNames: Readonly<
  Record<Solid3DRecord["definition"]["kind"], string>
> = {
  cone: "Конус",
  cube: "Куб",
  cuboid: "Прямоугольный параллелепипед",
  cylinder: "Цилиндр",
  prism: "Призма",
  pyramid: "Пирамида",
  sphere: "Сфера",
  tetrahedron: "Тетраэдр",
  "truncated-cone": "Усечённый конус",
};

function nextLabel(points: readonly Solid3DPoint[]): string {
  const used = new Set(points.map(({ label }) => label));
  return (
    [...letters].find((letter) => !used.has(letter)) ??
    `P${String(points.length + 1)}`
  );
}

function samePointSet(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((id) => right.includes(id as never))
  );
}

export function Solid3DEditorPanel({
  onClose,
  onProject,
  onRecordChange,
  onUndo,
  readOnly,
  record,
}: Solid3DEditorPanelProps): ReactElement {
  const [mode, setMode] = useState<"points" | "view">("view");
  const [cameraMode, setCameraMode] = useState<"orthographic" | "perspective">(
    "orthographic",
  );
  const [selectedPointIds, setSelectedPointIds] = useState<readonly string[]>(
    () => record.points.slice(-3).map(({ id }) => id),
  );
  const [showSectionFill, setShowSectionFill] = useState(true);
  const [showSectionOutline, setShowSectionOutline] = useState(true);
  const [resetToken, setResetToken] = useState(0);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const selectedTuple = useMemo(
    () =>
      selectedPointIds.length === 3
        ? ([
            selectedPointIds[0]!,
            selectedPointIds[1]!,
            selectedPointIds[2]!,
          ] as const)
        : null,
    [selectedPointIds],
  );
  const sectionResult = useMemo(
    () =>
      selectedTuple === null
        ? null
        : calculateSolidSection(record, selectedTuple),
    [record, selectedTuple],
  );
  const section = sectionResult?.status === "ok" ? sectionResult.section : null;
  const sectionDefinition =
    selectedTuple === null
      ? undefined
      : record.sections.find((candidate) =>
          samePointSet(candidate.pointIds, selectedTuple),
        );

  const placePoint = useCallback(
    (position: Vec3, anchor: SolidPointAnchor) => {
      if (readOnly) return;
      const point: Solid3DPoint = {
        anchor,
        id: solidPointId(`solid-point:${crypto.randomUUID()}`),
        label: nextLabel(record.points),
        position,
      };
      const nextSelection = [...selectedPointIds.slice(-2), point.id];
      const nextPoints = [...record.points, point];
      const provisional: Solid3DRecord = { ...record, points: nextPoints };
      const nextSection =
        nextSelection.length === 3
          ? calculateSolidSection(
              provisional,
              nextSelection as [
                Solid3DPoint["id"],
                Solid3DPoint["id"],
                Solid3DPoint["id"],
              ],
            )
          : null;
      const replacement: Solid3DRecord = {
        ...provisional,
        sections:
          nextSection?.status === "ok"
            ? [
                ...record.sections,
                {
                  algorithmVersion:
                    createSolidTopology(record.definition) === null
                      ? "analytic-plane/1"
                      : "polyhedron-plane/1",
                  id: solidSectionId(`solid-section:${crypto.randomUUID()}`),
                  pointIds: nextSelection as [
                    Solid3DPoint["id"],
                    Solid3DPoint["id"],
                    Solid3DPoint["id"],
                  ],
                  visible: true,
                },
              ]
            : record.sections,
      };
      setSelectedPointIds(nextSelection);
      onRecordChange(replacement);
    },
    [onRecordChange, readOnly, record, selectedPointIds],
  );

  const removePoint = (point: Solid3DPoint) => {
    setSelectedPointIds((current) => current.filter((id) => id !== point.id));
    onRecordChange({
      ...record,
      points: record.points.filter(({ id }) => id !== point.id),
      sections: record.sections.filter(
        (candidate) => !candidate.pointIds.includes(point.id),
      ),
    });
  };

  return (
    <div
      className="solid-3d-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-describedby="solid-3d-description"
        aria-labelledby="solid-3d-title"
        aria-modal="true"
        className="solid-3d-editor"
        role="dialog"
      >
        <header>
          <div>
            <p>Интерактивная стереометрия</p>
            <h2 id="solid-3d-title">{solidNames[record.definition.kind]}</h2>
          </div>
          <button
            aria-label="Закрыть 3D-окно"
            onClick={onClose}
            ref={closeButtonRef}
            type="button"
          >
            ×
          </button>
        </header>
        <p className="visually-hidden" id="solid-3d-description">
          Вращайте модель, ставьте точки на вершинах, рёбрах и гранях, затем
          перенесите сечение на доску.
        </p>
        <div className="solid-3d-toolbar" role="toolbar">
          <button
            aria-pressed={mode === "view"}
            onClick={() => setMode("view")}
            type="button"
          >
            Вращение
          </button>
          <button
            aria-pressed={mode === "points"}
            disabled={readOnly}
            onClick={() => setMode("points")}
            type="button"
          >
            Поставить точку
          </button>
          <button
            onClick={() =>
              setCameraMode((current) =>
                current === "orthographic" ? "perspective" : "orthographic",
              )
            }
            type="button"
          >
            {cameraMode === "orthographic"
              ? "Ортографическая"
              : "Перспективная"}
          </button>
          <button
            onClick={() => setResetToken((value) => value + 1)}
            type="button"
          >
            Сбросить камеру
          </button>
          <button disabled={readOnly} onClick={onUndo} type="button">
            Отменить
          </button>
        </div>
        <div className="solid-3d-layout">
          <div className="solid-3d-stage">
            <Solid3DViewport
              cameraMode={cameraMode}
              mode={mode}
              onPointPlace={placePoint}
              record={record}
              resetToken={resetToken}
              section={section}
              showSectionFill={showSectionFill}
              showSectionOutline={showSectionOutline}
            />
            <div aria-live="polite" className="solid-3d-progress">
              <strong>{selectedPointIds.length} / 3</strong>
              <span>
                {section === null
                  ? "Выберите три допустимые точки"
                  : `Площадь ${section.area.toFixed(2)} · периметр ${section.perimeter.toFixed(2)}`}
              </span>
            </div>
          </div>
          <aside>
            <h3>Точки</h3>
            {record.points.length === 0 ? (
              <p>Включите режим постановки точек и щёлкните по модели.</p>
            ) : (
              <ol className="solid-3d-points">
                {record.points.map((point) => (
                  <li key={point.id}>
                    <input
                      aria-label={`Выбрать точку ${point.label}`}
                      checked={selectedPointIds.includes(point.id)}
                      disabled={
                        !selectedPointIds.includes(point.id) &&
                        selectedPointIds.length >= 3
                      }
                      onChange={(event) =>
                        setSelectedPointIds((current) =>
                          event.currentTarget.checked
                            ? [...current, point.id].slice(-3)
                            : current.filter((id) => id !== point.id),
                        )
                      }
                      type="checkbox"
                    />
                    <input
                      aria-label={`Имя точки ${point.label}`}
                      disabled={readOnly}
                      maxLength={32}
                      onChange={(event) =>
                        onRecordChange({
                          ...record,
                          points: record.points.map((candidate) =>
                            candidate.id === point.id
                              ? {
                                  ...candidate,
                                  label:
                                    event.currentTarget.value || point.label,
                                }
                              : candidate,
                          ),
                        })
                      }
                      value={point.label}
                    />
                    <span>{point.anchor.kind}</span>
                    <button
                      aria-label={`Удалить точку ${point.label}`}
                      disabled={readOnly}
                      onClick={() => removePoint(point)}
                      type="button"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ol>
            )}
            <div className="solid-3d-options">
              <label>
                <input
                  checked={showSectionFill}
                  onChange={(event) =>
                    setShowSectionFill(event.currentTarget.checked)
                  }
                  type="checkbox"
                />
                Заливка сечения
              </label>
              <label>
                <input
                  checked={showSectionOutline}
                  onChange={(event) =>
                    setShowSectionOutline(event.currentTarget.checked)
                  }
                  type="checkbox"
                />
                Контур сечения
              </label>
            </div>
            {sectionResult?.status === "error" ? (
              <p className="solid-3d-error" role="alert">
                Точки совпадают, коллинеарны либо плоскость не пересекает тело.
              </p>
            ) : null}
            <button
              className="solid-3d-project"
              disabled={
                readOnly || section === null || sectionDefinition === undefined
              }
              onClick={() => {
                if (section !== null && sectionDefinition !== undefined)
                  onProject(sectionDefinition.id, section);
              }}
              type="button"
            >
              Отобразить сечение на доске
            </button>
            <details>
              <summary>Доступное описание</summary>
              <p>
                Вершин:{" "}
                {createSolidTopology(record.definition)?.vertices.length ??
                  "аналитическая поверхность"}
                ; точек: {record.points.length}; сечений:{" "}
                {record.sections.length}.
              </p>
              <ul>
                {record.points.map((point) => (
                  <li key={point.id}>
                    {point.label}: x {point.position.x.toFixed(2)}, y{" "}
                    {point.position.y.toFixed(2)}, z{" "}
                    {point.position.z.toFixed(2)}
                  </li>
                ))}
              </ul>
            </details>
          </aside>
        </div>
      </section>
    </div>
  );
}
