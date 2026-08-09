import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from "react";

import {
  createSolidTopology,
  isSolidSectionHelperPoint,
  resolveAnalyticSolidPointAnchor,
  resolveSolid3DPointPosition,
  resolveSolidPointAnchor,
  solidPointId,
  solidSectionId,
  type Solid3DPoint,
  type Solid3DRecord,
  type SolidAnalyticSurfaceId,
  type SolidPointAnchor,
  type SolidSectionResult,
  type Solid3DLearningAttempt,
  type Solid3DLearningScenario,
  type SolidElementRef,
  type SolidLearningAttemptAction,
  type SolidLearningMode,
  type Vec3,
} from "../../core/public";
import {
  calculateSolidSection,
  removeSavedSolidSection,
  saveSolidSectionFromPoints,
  setSavedSolidSectionVisibility,
} from "../../modules/solid-3d/public";
import { Solid3DViewport } from "../../adapters/solid-3d-three/public";
import { Solid3DLearningWorkspace } from "./Solid3DLearningWorkspace";
import { Solid3DParameterEditor } from "./Solid3DParameterEditor";
import { Solid3DSectionConstraintBuilder } from "./Solid3DSectionConstraintBuilder";
import "./Solid3DEditorPanel.css";

export interface Solid3DEditorPanelProps {
  readonly onClose: () => void;
  readonly onProject: (sectionId: string, section: SolidSectionResult) => void;
  readonly onRecordChange: (replacement: Solid3DRecord) => void;
  readonly onUndo: () => void;
  readonly readOnly: boolean;
  readonly record: Solid3DRecord;
  readonly learningAttempt: Solid3DLearningAttempt | null;
  readonly learningAttempts: readonly Solid3DLearningAttempt[];
  readonly learningEnabled: boolean;
  readonly onLearningAction: (action: SolidLearningAttemptAction) => void;
  readonly onLearningComplete: () => void;
  readonly onLearningReset: () => void;
  readonly onLearningStart: (
    scenario: Solid3DLearningScenario,
    mode: SolidLearningMode,
  ) => void;
}

const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const sectionNames = ["α", "β", "γ", "δ", "ε", "ζ", "η", "θ"] as const;
const solidNames: Readonly<
  Record<Solid3DRecord["definition"]["kind"], string>
> = {
  cone: "Конус",
  cube: "Куб",
  cuboid: "Прямоугольный параллелепипед",
  cylinder: "Цилиндр",
  hemisphere: "Полусфера",
  octahedron: "Октаэдр",
  prism: "Призма",
  pyramid: "Пирамида",
  "regular-polyhedron": "Правильный многогранник",
  sphere: "Сфера",
  tetrahedron: "Тетраэдр",
  "truncated-cone": "Усечённый конус",
  "truncated-pyramid": "Усечённая пирамида",
};

const analyticSurfaceNames: Readonly<Record<SolidAnalyticSurfaceId, string>> = {
  "surface:cone-base": "Основание конуса",
  "surface:cone-side": "Боковая поверхность конуса",
  "surface:cylinder-bottom": "Нижнее основание цилиндра",
  "surface:cylinder-side": "Боковая поверхность цилиндра",
  "surface:cylinder-top": "Верхнее основание цилиндра",
  "surface:hemisphere-base": "Основание полусферы",
  "surface:hemisphere-curved": "Сферическая поверхность полусферы",
  "surface:sphere": "Сферическая поверхность",
  "surface:truncated-cone-bottom": "Нижнее основание усечённого конуса",
  "surface:truncated-cone-side": "Боковая поверхность усечённого конуса",
  "surface:truncated-cone-top": "Верхнее основание усечённого конуса",
};

function visiblePoints(record: Solid3DRecord): readonly Solid3DPoint[] {
  return record.points.filter((point) => !isSolidSectionHelperPoint(point));
}

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

function resolveLearningAnchor(
  record: Solid3DRecord,
  anchor: SolidPointAnchor,
): Vec3 | null {
  if (anchor.kind === "analytic-surface")
    return resolveAnalyticSolidPointAnchor(record.definition, anchor);
  const topology = createSolidTopology(record.definition);
  return topology === null ? null : resolveSolidPointAnchor(topology, anchor);
}

function pointAnchorLabel(point: Solid3DPoint): string {
  if (point.anchor.kind !== "analytic-surface") return point.anchor.kind;
  return (
    analyticSurfaceNames[point.anchor.surfaceId as SolidAnalyticSurfaceId] ??
    "Аналитическая поверхность"
  );
}

export function Solid3DEditorPanel({
  onClose,
  onProject,
  onRecordChange,
  onUndo,
  readOnly,
  record,
  learningAttempt,
  learningAttempts,
  learningEnabled,
  onLearningAction,
  onLearningComplete,
  onLearningReset,
  onLearningStart,
}: Solid3DEditorPanelProps): ReactElement {
  const points = useMemo(() => visiblePoints(record), [record.points]);
  const [experience, setExperience] = useState<"free" | "learning">(
    learningAttempt === null ? "free" : "learning",
  );
  const [mode, setMode] = useState<"points" | "view">("view");
  const [cameraMode, setCameraMode] = useState<"orthographic" | "perspective">(
    "orthographic",
  );
  const [selectedPointIds, setSelectedPointIds] = useState<readonly string[]>(
    () => points.slice(-3).map(({ id }) => id),
  );
  const [activeSectionId, setActiveSectionId] = useState<string | null>(
    () => record.sections.at(-1)?.id ?? null,
  );
  const [showSectionFill, setShowSectionFill] = useState(true);
  const [showSectionOutline, setShowSectionOutline] = useState(true);
  const [resetToken, setResetToken] = useState(0);
  const [highlightedElement, setHighlightedElement] =
    useState<SolidElementRef | null>(null);
  const [hoveredSurfaceId, setHoveredSurfaceId] =
    useState<SolidAnalyticSurfaceId | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const sanitizedSelectedPointIds = useMemo(
    () =>
      selectedPointIds.filter((id) => points.some((point) => point.id === id)),
    [points, selectedPointIds],
  );

  const selectedTuple = useMemo(
    () =>
      sanitizedSelectedPointIds.length === 3
        ? ([
            sanitizedSelectedPointIds[0]!,
            sanitizedSelectedPointIds[1]!,
            sanitizedSelectedPointIds[2]!,
          ] as [Solid3DPoint["id"], Solid3DPoint["id"], Solid3DPoint["id"]])
        : null,
    [sanitizedSelectedPointIds],
  );
  const previewResult = useMemo(
    () =>
      selectedTuple === null
        ? null
        : calculateSolidSection(record, selectedTuple),
    [record, selectedTuple],
  );
  const previewSection =
    previewResult?.status === "ok" ? previewResult.section : null;
  const previewSaved =
    selectedTuple === null
      ? undefined
      : record.sections.find((candidate) =>
          samePointSet(candidate.pointIds, selectedTuple),
        );
  const activeSectionDefinition =
    record.sections.find(({ id }) => id === activeSectionId) ??
    record.sections.at(-1);
  const activeSectionResult =
    activeSectionDefinition === undefined
      ? null
      : calculateSolidSection(record, activeSectionDefinition.pointIds);
  const activeSection =
    activeSectionResult?.status === "ok" &&
    activeSectionDefinition?.visible === true
      ? activeSectionResult.section
      : null;
  const freeVisibleSection = previewSection ?? activeSection;

  const startLearning = (
    scenario: Solid3DLearningScenario,
    learningMode: SolidLearningMode,
  ) => {
    if (scenario.seedAnchors.length >= 3) {
      const learningPoints = scenario.seedAnchors
        .slice(0, 3)
        .flatMap((anchor, index) => {
          const position = resolveLearningAnchor(record, anchor);
          return position === null
            ? []
            : [
                {
                  anchor,
                  id: solidPointId(
                    `solid-point:learning:${crypto.randomUUID()}`,
                  ),
                  label: letters[index] ?? `P${String(index + 1)}`,
                  position,
                } satisfies Solid3DPoint,
              ];
        });
      if (learningPoints.length === 3) {
        const ids = learningPoints.map(({ id }) => id) as [
          Solid3DPoint["id"],
          Solid3DPoint["id"],
          Solid3DPoint["id"],
        ];
        const provisional: Solid3DRecord = {
          ...record,
          points: learningPoints,
        };
        const calculated = calculateSolidSection(provisional, ids);
        const learningSectionId = solidSectionId(
          `solid-section:learning:${crypto.randomUUID()}`,
        );
        onRecordChange({
          ...provisional,
          sections:
            calculated.status === "ok"
              ? [
                  {
                    algorithmVersion:
                      createSolidTopology(record.definition) === null
                        ? "analytic-plane/1"
                        : "polyhedron-plane/1",
                    id: learningSectionId,
                    pointIds: ids,
                    visible: true,
                  },
                ]
              : [],
        });
        setSelectedPointIds(ids);
        if (calculated.status === "ok") setActiveSectionId(learningSectionId);
      }
    }
    onLearningStart(scenario, learningMode);
  };

  const visibleSection =
    experience === "free" ||
    learningAttempt?.mode === "teacher-demo" ||
    learningAttempt?.prediction?.submitted === true
      ? freeVisibleSection
      : null;

  const placePoint = useCallback(
    (position: Vec3, anchor: SolidPointAnchor) => {
      if (readOnly) return;
      const point: Solid3DPoint = {
        anchor,
        id: solidPointId(`solid-point:${crypto.randomUUID()}`),
        label: nextLabel(points),
        position,
      };
      const nextSelection = [...sanitizedSelectedPointIds.slice(-2), point.id];
      setSelectedPointIds(nextSelection);
      onRecordChange({ ...record, points: [...record.points, point] });
    },
    [onRecordChange, points, readOnly, record, sanitizedSelectedPointIds],
  );

  const savePreview = (): void => {
    if (selectedTuple === null || previewSection === null) return;
    const result = saveSolidSectionFromPoints({
      pointIds: selectedTuple,
      record,
      token: crypto.randomUUID(),
    });
    if (result.status === "error") return;
    onRecordChange(result.record);
    setActiveSectionId(result.sectionId);
  };

  const removePoint = (point: Solid3DPoint): void => {
    setSelectedPointIds((current) => current.filter((id) => id !== point.id));
    let replacement = record;
    for (const section of record.sections.filter((candidate) =>
      candidate.pointIds.includes(point.id),
    )) {
      replacement = removeSavedSolidSection(replacement, section.id);
    }
    replacement = {
      ...replacement,
      points: replacement.points.filter(({ id }) => id !== point.id),
    };
    if (
      activeSectionId !== null &&
      !replacement.sections.some(({ id }) => id === activeSectionId)
    )
      setActiveSectionId(replacement.sections.at(-1)?.id ?? null);
    onRecordChange(replacement);
  };

  const deleteSection = (sectionId: string): void => {
    const replacement = removeSavedSolidSection(record, sectionId);
    if (activeSectionId === sectionId)
      setActiveSectionId(replacement.sections.at(-1)?.id ?? null);
    onRecordChange(replacement);
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
          Вращайте модель, ставьте точки, предварительно просматривайте
          плоскость и явно сохраняйте нужные сечения.
        </p>
        <div className="solid-3d-toolbar" role="toolbar">
          <button
            aria-pressed={experience === "free"}
            onClick={() => setExperience("free")}
            type="button"
          >
            Свободное исследование
          </button>
          <button
            aria-pressed={experience === "learning"}
            disabled={!learningEnabled}
            onClick={() => setExperience("learning")}
            type="button"
          >
            Учебная задача
          </button>
          <button
            aria-pressed={mode === "view"}
            onClick={() => setMode("view")}
            type="button"
          >
            Вращение камеры
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
              highlightedElement={highlightedElement}
              highlightedSurfaceId={hoveredSurfaceId}
              mode={mode}
              onElementHover={setHighlightedElement}
              onPointPlace={placePoint}
              onSurfaceHover={setHoveredSurfaceId}
              record={record}
              resetToken={resetToken}
              section={visibleSection}
              showSectionFill={showSectionFill}
              showSectionOutline={showSectionOutline}
            />
            <div aria-live="polite" className="solid-3d-progress">
              <strong>{sanitizedSelectedPointIds.length} / 3</strong>
              <span>
                {previewSection !== null
                  ? `Preview · площадь ${previewSection.area.toFixed(2)} · периметр ${previewSection.perimeter.toFixed(2)}`
                  : activeSection !== null
                    ? `Сохранено · площадь ${activeSection.area.toFixed(2)} · периметр ${activeSection.perimeter.toFixed(2)}`
                    : "Выберите три допустимые точки"}
                {hoveredSurfaceId === null
                  ? ""
                  : ` · ${analyticSurfaceNames[hoveredSurfaceId]}`}
              </span>
            </div>
          </div>
          <aside>
            <Solid3DParameterEditor
              onRecordChange={onRecordChange}
              readOnly={readOnly}
              record={record}
            />
            <h3>Точки</h3>
            {points.length === 0 ? (
              <p>Включите режим постановки точек и щёлкните по модели.</p>
            ) : (
              <ol className="solid-3d-points">
                {points.map((point) => (
                  <li key={point.id}>
                    <input
                      aria-label={`Выбрать точку ${point.label}`}
                      checked={sanitizedSelectedPointIds.includes(point.id)}
                      disabled={
                        !sanitizedSelectedPointIds.includes(point.id) &&
                        sanitizedSelectedPointIds.length >= 3
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
                    <span>{pointAnchorLabel(point)}</span>
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
            {previewResult?.status === "error" ? (
              <p className="solid-3d-error" role="alert">
                Выбранные точки дают вырожденную плоскость либо плоскость не
                пересекает тело.
              </p>
            ) : null}
            <button
              disabled={
                readOnly ||
                previewSection === null ||
                previewSaved !== undefined ||
                record.sections.length >= 8
              }
              onClick={savePreview}
              type="button"
            >
              {previewSaved === undefined
                ? "Создать сечение"
                : "Сечение сохранено"}
            </button>
            <Solid3DSectionConstraintBuilder
              key={`${JSON.stringify(record.definition)}:${points
                .map(({ id }) => id)
                .join(",")}`}
              onRecordChange={onRecordChange}
              onSectionCreated={setActiveSectionId}
              readOnly={readOnly || record.sections.length >= 8}
              record={record}
            />
            <h3>Сохранённые сечения</h3>
            {record.sections.length === 0 ? (
              <p>Сохранённых сечений пока нет.</p>
            ) : (
              <ol className="solid-3d-sections">
                {record.sections.map((sectionDefinition, index) => {
                  const calculated = calculateSolidSection(
                    record,
                    sectionDefinition.pointIds,
                  );
                  const name = sectionNames[index] ?? `S${String(index + 1)}`;
                  return (
                    <li key={sectionDefinition.id}>
                      <button
                        aria-pressed={
                          activeSectionDefinition?.id === sectionDefinition.id
                        }
                        onClick={() => setActiveSectionId(sectionDefinition.id)}
                        type="button"
                      >
                        {name}
                      </button>
                      <label>
                        <input
                          aria-label={`Показывать сечение ${name}`}
                          checked={sectionDefinition.visible}
                          disabled={readOnly}
                          onChange={(event) =>
                            onRecordChange(
                              setSavedSolidSectionVisibility(
                                record,
                                sectionDefinition.id,
                                event.currentTarget.checked,
                              ),
                            )
                          }
                          type="checkbox"
                        />
                        видно
                      </label>
                      <span>
                        {calculated.status === "ok"
                          ? `S=${calculated.section.area.toFixed(2)}`
                          : "требует проверки"}
                      </span>
                      <button
                        aria-label={`Удалить сечение ${name}`}
                        disabled={readOnly}
                        onClick={() => deleteSection(sectionDefinition.id)}
                        type="button"
                      >
                        ×
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
            <button
              className="solid-3d-project"
              disabled={
                readOnly ||
                activeSectionDefinition === undefined ||
                activeSectionResult?.status !== "ok"
              }
              onClick={() => {
                if (
                  activeSectionDefinition !== undefined &&
                  activeSectionResult?.status === "ok"
                )
                  onProject(
                    activeSectionDefinition.id,
                    activeSectionResult.section,
                  );
              }}
              type="button"
            >
              Отобразить выбранное сечение на доске
            </button>
            <details>
              <summary>Доступное описание</summary>
              <p>
                Вершин:{" "}
                {createSolidTopology(record.definition)?.vertices.length ??
                  "аналитическая поверхность"}
                ; точек: {points.length}; сечений: {record.sections.length}.
              </p>
              <ul>
                {points.map((point) => {
                  const position = resolveSolid3DPointPosition(
                    record.definition,
                    point,
                  );
                  return (
                    <li key={point.id}>
                      {point.label}: x {position.x.toFixed(2)}, y{" "}
                      {position.y.toFixed(2)}, z {position.z.toFixed(2)}
                    </li>
                  );
                })}
              </ul>
            </details>
          </aside>
        </div>
        {experience === "learning" && learningEnabled ? (
          <Solid3DLearningWorkspace
            attempt={learningAttempt}
            learningAttempts={learningAttempts}
            highlighted={highlightedElement}
            onAction={onLearningAction}
            onComplete={onLearningComplete}
            onHighlight={setHighlightedElement}
            onReset={onLearningReset}
            onRecordChange={onRecordChange}
            onStart={startLearning}
            readOnly={readOnly}
            record={record}
            section={freeVisibleSection}
          />
        ) : null}
      </section>
    </div>
  );
}
