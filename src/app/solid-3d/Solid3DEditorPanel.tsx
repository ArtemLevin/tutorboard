import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type RefObject,
} from "react";

import {
  createSolidTopology,
  isSolidSectionHelperPoint,
  calculateSolidDistance,
  saveSolidDistance,
  type SolidDistanceEndpoint,
  resolveAnalyticSolidPointAnchor,
  resolveSolid3DPointPosition,
  reprojectSolid3DRecord,
  resolveSolidPointAnchor,
  solidPointId,
  solidSectionId,
  withSolid3DModelQuaternion,
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
  getSolidSectionSweepFrame,
  previewSolidSectionSweep,
  getSolidSectionRotationFrameForAxis,
  type SolidSectionRotationAxis,
  previewSolidSectionRotationFrame,
  removeSavedSolidSection,
  saveSolidSectionFromPoints,
  setSavedSolidSectionVisibility,
} from "../../modules/solid-3d/public";
import {
  Solid3DViewport,
  type SolidPointDragPlacement,
} from "../../adapters/solid-3d-three/public";
import { Solid3DLearningWorkspace } from "./Solid3DLearningWorkspace";
import { Solid3DParameterEditor } from "./Solid3DParameterEditor";
import { Solid3DOrientationEditor } from "./Solid3DOrientationEditor";
import { Solid3DConstructionEditor } from "./Solid3DConstructionEditor";
import { Solid3DSectionConstraintBuilder } from "./Solid3DSectionConstraintBuilder";
import { Solid3DSectionRotationControls } from "./Solid3DSectionRotationControls";
import { useSolid3DWindow } from "./useSolid3DWindow";
import "./Solid3DEditorPanel.css";
import "./Solid3DSections.css";

export interface Solid3DEditorPanelProps {
  readonly fallbackFocusRef?: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  readonly onProject: (sectionId: string, section: SolidSectionResult) => void;
  readonly onRecordChange: (replacement: Solid3DRecord) => void;
  readonly onSaveSweep: (
    startingRecord: Solid3DRecord,
    pointIds: readonly [
      Solid3DPoint["id"],
      Solid3DPoint["id"],
      Solid3DPoint["id"],
    ],
    offset: number,
    token: string,
  ) => {
    readonly sectionId: string;
    readonly pointIds: readonly [
      Solid3DPoint["id"],
      Solid3DPoint["id"],
      Solid3DPoint["id"],
    ];
  } | null;
  readonly onSaveRotation: (
    startingRecord: Solid3DRecord,
    pointIds: readonly [
      Solid3DPoint["id"],
      Solid3DPoint["id"],
      Solid3DPoint["id"],
    ],
    axis: SolidSectionRotationAxis,
    angleDegrees: number,
    token: string,
  ) => {
    readonly sectionId: string;
    readonly pointIds: readonly [
      Solid3DPoint["id"],
      Solid3DPoint["id"],
      Solid3DPoint["id"],
    ];
  } | null;
  readonly onPointMove: (
    startingRecord: Solid3DRecord,
    pointId: string,
    position: Vec3,
    anchor: SolidPointAnchor,
  ) => void;
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

function visiblePoints(
  points: readonly Solid3DPoint[],
): readonly Solid3DPoint[] {
  return points.filter((point) => !isSolidSectionHelperPoint(point));
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
  fallbackFocusRef,
  onClose,
  onProject,
  onRecordChange,
  onPointMove,
  onSaveSweep,
  onSaveRotation,
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
  const [dragPreview, setDragPreview] = useState<{
    readonly pointId: string;
    readonly placement: SolidPointDragPlacement;
  } | null>(null);
  const startingDragRecord = useRef<Solid3DRecord | null>(null);
  const previewRecord = useMemo(() => {
    if (readOnly || dragPreview === null) return record;
    const updated = record.points.map((point) =>
      point.id === dragPreview.pointId
        ? { ...point, ...dragPreview.placement }
        : point,
    );
    return reprojectSolid3DRecord(
      { ...record, points: updated },
      record.definition,
    );
  }, [dragPreview, readOnly, record]);
  const points = useMemo(
    () => visiblePoints(previewRecord.points),
    [previewRecord.points],
  );
  const [experience, setExperience] = useState<"free" | "learning">(
    learningAttempt === null ? "free" : "learning",
  );
  const [mode, setMode] = useState<"points" | "view">("view");
  const [showRotationGizmo, setShowRotationGizmo] = useState(false);
  const [workMode, setWorkMode] = useState<"explore" | "section" | "points" | "measure">(
    "explore",
  );
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [measureSelection, setMeasureSelection] = useState<readonly SolidDistanceEndpoint[]>([]);
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
  const [sweepEnabled, setSweepEnabled] = useState(false);
  const [sweepOffset, setSweepOffset] = useState(0);
  const [rotationEnabled, setRotationEnabled] = useState(false);
  const [rotationEdgeId, setRotationEdgeId] = useState("");
  const [rotationAxisKind, setRotationAxisKind] = useState<"edge" | "points">(
    "edge",
  );
  const [rotationAxisPoints, setRotationAxisPoints] = useState<
    readonly [Solid3DPoint["id"] | "", Solid3DPoint["id"] | ""]
  >(["", ""]);
  const [rotationAngle, setRotationAngle] = useState(0);
  const [resetToken, setResetToken] = useState(0);
  const {
    dockRef,
    windowRect,
    expanded,
    toggleExpanded,
    startWindowGesture,
    moveWindowGesture,
    endWindowGesture,
    handleWindowArrow,
  } = useSolid3DWindow();
  const [highlightedElement, setHighlightedElement] =
    useState<SolidElementRef | null>(null);
  const [hoveredSurfaceId, setHoveredSurfaceId] =
    useState<SolidAnalyticSurfaceId | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(
    typeof document !== "undefined" &&
      document.activeElement instanceof HTMLElement &&
      document.activeElement !== document.body
      ? document.activeElement
      : null,
  );

  useEffect(() => {
    let mounted = true;
    const original = returnFocusRef.current;
    const fallback = fallbackFocusRef?.current ?? null;
    queueMicrotask(() => {
      if (mounted) panelRef.current?.focus();
    });
    return () => {
      mounted = false;
      queueMicrotask(() => {
        const target =
          original?.isConnected === true
            ? original
            : fallback?.isConnected === true
              ? fallback
              : null;
        target?.focus();
      });
    };
  }, [fallbackFocusRef]);
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
        : calculateSolidSection(previewRecord, selectedTuple),
    [previewRecord, selectedTuple],
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
  const savedSectionResults = useMemo(
    () =>
      new Map(
        record.sections.map((section) => [
          section.id,
          calculateSolidSection(record, section.pointIds),
        ]),
      ),
    [record],
  );
  const activeSectionResult = useMemo(
    () =>
      activeSectionDefinition === undefined
        ? null
        : calculateSolidSection(
            previewRecord,
            activeSectionDefinition.pointIds,
          ),
    [activeSectionDefinition, previewRecord],
  );
  const activeSection =
    activeSectionResult?.status === "ok" &&
    activeSectionDefinition?.visible === true
      ? activeSectionResult.section
      : null;
  const sweepFrame = useMemo(
    () =>
      selectedTuple === null
        ? null
        : getSolidSectionSweepFrame(previewRecord, selectedTuple),
    [previewRecord, selectedTuple],
  );
  const sweepPreview = useMemo(
    () =>
      sweepEnabled && selectedTuple !== null
        ? previewSolidSectionSweep(previewRecord, selectedTuple, sweepOffset)
        : null,
    [previewRecord, selectedTuple, sweepEnabled, sweepOffset],
  );
  const rotationTopology = useMemo(
    () => createSolidTopology(previewRecord.definition),
    [previewRecord.definition],
  );
  const rotationAxis = useMemo((): SolidSectionRotationAxis | null => {
    if (rotationAxisKind === "edge")
      return rotationEdgeId === ""
        ? null
        : { kind: "edge", edgeId: rotationEdgeId };
    const [first, second] = rotationAxisPoints;
    return first === "" || second === "" || first === second
      ? null
      : { kind: "points", pointIds: [first, second] };
  }, [rotationAxisKind, rotationEdgeId, rotationAxisPoints]);
  const rotationFrame = useMemo(
    () =>
      selectedTuple !== null && rotationAxis !== null
        ? getSolidSectionRotationFrameForAxis(
            previewRecord,
            selectedTuple,
            rotationAxis,
          )
        : null,
    [previewRecord, selectedTuple, rotationAxis],
  );
  const rotationAxisLine = useMemo(
    (): readonly [Vec3, Vec3] | null =>
      rotationEnabled && rotationAxisKind === "points" && rotationFrame !== null
        ? [rotationFrame.axisStart, rotationFrame.axisEnd]
        : null,
    [rotationEnabled, rotationAxisKind, rotationFrame],
  );
  const rotationPreview = useMemo(
    () =>
      rotationEnabled && rotationTopology !== null && rotationFrame !== null
        ? previewSolidSectionRotationFrame(
            rotationTopology,
            rotationFrame,
            rotationAngle,
          )
        : null,
    [rotationEnabled, rotationTopology, rotationFrame, rotationAngle],
  );
  const freeVisibleSection = rotationEnabled
    ? (rotationPreview?.section ?? null)
    : sweepEnabled
      ? (sweepPreview?.section ?? null)
      : (previewSection ?? activeSection);

  const startLearning = (
    scenario: Solid3DLearningScenario,
    learningMode: SolidLearningMode,
  ) => {
    setSweepEnabled(false);
    setSweepOffset(0);
    setRotationEnabled(false);
    setRotationAngle(0);
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

  const measuredEndpoints = measureSelection.filter((endpoint) =>
    endpoint.kind === "point"
      ? previewRecord.points.some(({ id }) => id === endpoint.id)
      : createSolidTopology(previewRecord.definition)?.vertices.some(
          ({ id }) => id === endpoint.id,
        ) === true,
  );
  const measurementPreview = measuredEndpoints.length === 2
    ? calculateSolidDistance(previewRecord, measuredEndpoints[0]!, measuredEndpoints[1]!)
    : null;
  const chooseMeasurementEndpoint = (endpoint: SolidDistanceEndpoint): void => {
    setMeasureSelection((selected) => {
      if (selected.length >= 2) return [endpoint];
      if (selected.some((candidate) => candidate.id === endpoint.id &&
          candidate.kind === endpoint.kind)) return selected;
      return [...selected, endpoint];
    });
  };
  const measurementEndpointLabel = (endpoint: SolidDistanceEndpoint): string =>
    endpoint.kind === "point"
      ? record.points.find(({ id }) => id === endpoint.id)?.label ?? endpoint.id
      : createSolidTopology(record.definition)?.vertices.find(
          ({ id }) => id === endpoint.id,
        )?.label ?? endpoint.id;
  const saveMeasurement = (): void => {
    if (readOnly || measuredEndpoints.length !== 2) return;
    const replacement = saveSolidDistance(
      record,
      measuredEndpoints[0]!,
      measuredEndpoints[1]!,
      `solid-distance:${crypto.randomUUID()}`,
    );
    if (replacement === null) return;
    onRecordChange(replacement);
    setMeasureSelection([]);
  };

  const placePoint = useCallback(
    (position: Vec3, anchor: SolidPointAnchor) => {
      if (readOnly || record.points.length >= 32) return;
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

  const saveSweep = (): void => {
    if (
      readOnly ||
      selectedTuple === null ||
      sweepPreview?.section == null ||
      Math.abs(sweepOffset) < 1e-8
    )
      return;
    const saved = onSaveSweep(
      record,
      selectedTuple,
      sweepOffset,
      crypto.randomUUID(),
    );
    if (saved === null) return;
    setActiveSectionId(saved.sectionId);
    // Saved sweep points belong to the section and stay out of the point picker.
    setSelectedPointIds([]);
    setSweepEnabled(false);
    setSweepOffset(0);
  };

  const saveRotation = (): void => {
    if (
      readOnly ||
      selectedTuple === null ||
      rotationAxis === null ||
      Math.abs(rotationAngle) < 1e-8 ||
      rotationPreview?.section == null
    )
      return;
    const saved = onSaveRotation(
      record,
      selectedTuple,
      rotationAxis,
      rotationAngle,
      crypto.randomUUID(),
    );
    if (saved === null) return;
    setActiveSectionId(saved.sectionId);
    setSelectedPointIds([]);
    setRotationEnabled(false);
    setRotationAngle(0);
  };

  const adjustRotationAngle = (next: number): void => {
    if (Number.isFinite(next))
      setRotationAngle(Math.min(180, Math.max(-180, next)));
  };

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
      measurements: (replacement.measurements ?? []).filter(
        ({ first, second }) =>
          !(first.kind === "point" && first.id === point.id) &&
          !(second.kind === "point" && second.id === point.id),
      ),
    };
    setMeasureSelection((selected) => selected.filter(
      (candidate) => !(candidate.kind === "point" && candidate.id === point.id),
    ));
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
      className={`solid-3d-dock${expanded ? " is-expanded" : ""}`}
      data-testid="solid-3d-dock"
      ref={dockRef}
      style={
        windowRect === null
          ? undefined
          : {
              left: windowRect.left,
              right: "auto",
              top: windowRect.top,
              width: windowRect.width,
              height: windowRect.height,
            }
      }
    >
      <section
        aria-describedby="solid-3d-description"
        aria-labelledby="solid-3d-title"
        className="solid-3d-editor"
        data-testid="solid-3d-editor"
        onKeyDown={(event) => {
          // Keyboard shortcuts inside the editor must not reach the board.
          event.stopPropagation();
          if (event.key === "Escape") {
            event.preventDefault();
            if (advancedOpen) setAdvancedOpen(false);
            else onClose();
          }
        }}
        onPointerDown={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
        ref={panelRef}
        role="region"
        tabIndex={-1}
      >
        <header>
          <button
            aria-label="Переместить 3D-окно"
            className="solid-3d-drag-handle"
            onKeyDown={(event) => handleWindowArrow(event, "move")}
            onPointerCancel={endWindowGesture}
            onPointerDown={(event) => startWindowGesture(event, "move")}
            onPointerMove={moveWindowGesture}
            onPointerUp={endWindowGesture}
            title="Перетащите мышью или используйте стрелки"
            type="button"
          >
            <span aria-hidden="true">⠿</span>
            <span>
              <small>Интерактивная стереометрия</small>
              <strong id="solid-3d-title">
                {solidNames[record.definition.kind]}
              </strong>
            </span>
          </button>
          <div className="solid-3d-window-actions">
            <button
              aria-label={expanded ? "Свернуть 3D-окно" : "Развернуть 3D-окно"}
              aria-pressed={expanded}
              onClick={toggleExpanded}
              type="button"
            >
              {expanded ? "↙" : "↗"}
            </button>
            <button
              aria-label="Закрыть 3D-окно"
              onClick={onClose}
              type="button"
            >
              ×
            </button>
          </div>
        </header>
        <p className="visually-hidden" id="solid-3d-description">
          Вращайте модель, ставьте точки, предварительно просматривайте
          плоскость и явно сохраняйте нужные сечения.
        </p>
        <div
          aria-label="Режимы работы с 3D"
          className="solid-3d-toolbar"
          role="toolbar"
        >
          <button
            aria-pressed={experience === "free" && workMode === "explore"}
            onClick={() => {
              setExperience("free");
              setWorkMode("explore");
              setMode("view");
            }}
            type="button"
          >
            Исследование
          </button>
          <button
            aria-pressed={experience === "free" && workMode === "section"}
            onClick={() => {
              setExperience("free");
              setWorkMode("section");
              setMode(readOnly ? "view" : "points");
            }}
            type="button"
          >
            Сечение
          </button>
          <button
            aria-pressed={experience === "free" && workMode === "points"}
            disabled={readOnly || record.points.length >= 32}
            onClick={() => {
              setExperience("free");
              setWorkMode("points");
              setMode("points");
            }}
            type="button"
          >
            Поставить точку
          </button>
          <button
            aria-pressed={experience === "free" && workMode === "measure"}
            onClick={() => {
              setExperience("free");
              setWorkMode("measure");
              setMode("view");
            }}
            type="button"
          >
            Измерить
          </button>
          <button
            aria-pressed={experience === "learning"}
            disabled={!learningEnabled}
            onClick={() => {
              setExperience("learning");
              setMode("view");
            }}
            type="button"
          >
            Учебная задача
          </button>
          <button
            aria-controls="solid-3d-advanced"
            aria-expanded={advancedOpen}
            className="solid-3d-settings-trigger"
            onClick={() => setAdvancedOpen((open) => !open)}
            type="button"
          >
            Настройки <span aria-hidden="true">⚙</span>
          </button>
        </div>
        <div aria-label="Управление камерой" className="solid-3d-camera-bar">
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
          <span className="solid-3d-camera-tip">
            {mode === "points"
              ? "ЛКМ — точка или перемещение · ПКМ — вращение"
              : "ЛКМ — вращение · ПКМ — перемещение · колесо — масштаб"}
          </span>
        </div>
        <div className="solid-3d-layout">
          <div className="solid-3d-stage">
            <Solid3DViewport
              cameraMode={cameraMode}
              highlightedElement={highlightedElement}
              highlightedSurfaceId={hoveredSurfaceId}
              mode={mode}
              showRotationGizmo={
                showRotationGizmo && mode === "view" && !readOnly
              }
              rotationAxis={rotationAxisLine}
              onElementHover={setHighlightedElement}
              onModelRotationCommit={
                readOnly
                  ? undefined
                  : (rotation) =>
                      onRecordChange(
                        withSolid3DModelQuaternion(record, rotation),
                      )
              }
              onMeasurementPick={
                experience === "free" && workMode === "measure"
                  ? chooseMeasurementEndpoint
                  : undefined
              }
              measurementPreview={
                experience === "free" && workMode === "measure" &&
                measuredEndpoints.length === 2
                  ? [measuredEndpoints[0]!, measuredEndpoints[1]!]
                  : null
              }
              onPointPlace={placePoint}
              onPointDragStart={() => {
                if (readOnly) return;
                setDragPreview(null);
                startingDragRecord.current = record;
              }}
              onPointDragPreview={(pointId, placement) => {
                if (readOnly || startingDragRecord.current === null) return;
                setDragPreview({ pointId, placement });
              }}
              onPointDragEnd={
                readOnly
                  ? undefined
                  : (pointId, placement) => {
                      const initial = startingDragRecord.current;
                      startingDragRecord.current = null;
                      setDragPreview(null);
                      if (initial === null || placement === null) return;
                      onPointMove(
                        initial,
                        pointId,
                        placement.position,
                        placement.anchor,
                      );
                    }
              }
              onSurfaceHover={setHoveredSurfaceId}
              record={previewRecord}
              resetToken={resetToken}
              section={visibleSection}
              showSectionFill={showSectionFill}
              showSectionOutline={showSectionOutline}
            />
            {experience === "free" && workMode === "measure" ? (
              <div aria-live="polite" className="solid-3d-progress">
                <strong>{measuredEndpoints.length} / 2</strong>
                <span>
                  {measurementPreview === null
                    ? "Выберите два конца отрезка на модели"
                    : `Расстояние: ${measurementPreview.toFixed(3)} ед.`}
                </span>
              </div>
            ) : experience === "free" && workMode === "section" ? (
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
            ) : null}
          </div>
          <aside className="solid-3d-inspector">
            <h3 className="solid-3d-inspector-title">Основное</h3>
            <Solid3DParameterEditor
              onRecordChange={onRecordChange}
              readOnly={readOnly}
              record={record}
            />
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
            {experience === "free" && workMode === "measure" ? (
              <section aria-label="Измерение расстояния" className="solid-3d-measurements">
                <h3>Расстояние между точками</h3>
                <p>Щёлкните две вершины или ранее поставленные точки на модели.</p>
                <p aria-live="polite">
                  {measuredEndpoints.length === 0
                    ? "Выберите первую точку"
                    : measuredEndpoints.length === 1
                      ? "Выберите вторую точку"
                      : measurementPreview === null
                        ? "Недопустимый выбор"
                        : `Длина: ${measurementPreview.toFixed(3)} ед.`}
                </p>
                <div className="solid-3d-measure-actions">
                  <button
                    disabled={readOnly || measurementPreview === null ||
                      (record.measurements?.length ?? 0) >= 16}
                    onClick={saveMeasurement}
                    type="button"
                  >
                    Сохранить измерение
                  </button>
                  <button
                    disabled={measureSelection.length === 0}
                    onClick={() => setMeasureSelection([])}
                    type="button"
                  >Сбросить выбор</button>
                </div>
                {(record.measurements?.length ?? 0) > 0 ? (
                  <ol className="solid-3d-measure-list">
                    {record.measurements?.map((measurement) => {
                      const length = calculateSolidDistance(
                        previewRecord, measurement.first, measurement.second,
                      );
                      return (
                        <li key={measurement.id}>
                          <span>
                            {measurementEndpointLabel(measurement.first)} —{" "}
                            {measurementEndpointLabel(measurement.second)}
                            <strong> {length?.toFixed(3) ?? "—"} ед.</strong>
                          </span>
                          <button
                            aria-label={`Удалить измерение ${measurement.id}`}
                            disabled={readOnly}
                            onClick={() => onRecordChange({
                              ...record,
                              measurements: (record.measurements ?? []).filter(
                                ({ id }) => id !== measurement.id,
                              ),
                            })}
                            type="button"
                          >×</button>
                        </li>
                      );
                    })}
                  </ol>
                ) : null}
              </section>
            ) : null}
            <div
              className="solid-3d-mode-content"
              hidden={experience !== "free" || (workMode !== "section" && workMode !== "points")}
            >
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
                        onChange={(event) => {
                          setSweepOffset(0);
                          setRotationAngle(0);
                          setSelectedPointIds((current) =>
                            event.currentTarget.checked
                              ? [...current, point.id].slice(-3)
                              : current.filter((id) => id !== point.id),
                          );
                        }}
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
              <div
                className="solid-3d-section-content"
                hidden={workMode !== "section"}
              >
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
                <section
                  aria-label="Динамическая секущая плоскость"
                  className="solid-3d-sweep"
                >
                  <h3>Динамическая секущая плоскость</h3>
                  {sweepFrame === null ? (
                    <p>
                      Выберите три неколлинеарные точки выпуклого многогранника.
                    </p>
                  ) : (
                    <>
                      <label>
                        <input
                          checked={sweepEnabled}
                          onChange={(event) => {
                            setSweepEnabled(event.currentTarget.checked);
                            setSweepOffset(0);
                            if (event.currentTarget.checked) {
                              setRotationEnabled(false);
                              setRotationAngle(0);
                            }
                          }}
                          type="checkbox"
                        />
                        Параллельное перемещение плоскости
                      </label>
                      {sweepEnabled ? (
                        <>
                          <label htmlFor="solid-3d-sweep-offset">
                            Смещение: {sweepOffset.toFixed(2)}
                          </label>
                          <input
                            aria-label="Смещение секущей плоскости"
                            id="solid-3d-sweep-offset"
                            max={sweepFrame.maxOffset}
                            min={sweepFrame.minOffset}
                            onChange={(event) =>
                              setSweepOffset(Number(event.currentTarget.value))
                            }
                            step="any"
                            type="range"
                            value={Math.max(
                              sweepFrame.minOffset,
                              Math.min(sweepFrame.maxOffset, sweepOffset),
                            )}
                          />
                          <p aria-live="polite">
                            {sweepPreview?.section == null
                              ? "Плоскость не образует сечение тела"
                              : `Площадь ${sweepPreview.section.area.toFixed(2)} · периметр ${sweepPreview.section.perimeter.toFixed(2)}`}
                          </p>
                          <button
                            disabled={
                              readOnly ||
                              Math.abs(sweepOffset) < 1e-8 ||
                              sweepPreview?.section == null ||
                              record.sections.length >= 8 ||
                              record.points.length + 3 > 32
                            }
                            onClick={saveSweep}
                            type="button"
                          >
                            Сохранить положение плоскости
                          </button>
                        </>
                      ) : null}
                    </>
                  )}
                </section>
                <Solid3DSectionRotationControls
                  topology={rotationTopology}
                  hasSourcePlane={sweepFrame !== null}
                  enabled={rotationEnabled}
                  onEnabledChange={(next) => {
                    setRotationEnabled(next);
                    setRotationAngle(0);
                    if (next) {
                      setSweepEnabled(false);
                      setSweepOffset(0);
                    }
                  }}
                  axisKind={rotationAxisKind}
                  onAxisKindChange={(kind) => {
                    setRotationAxisKind(kind);
                    setRotationAngle(0);
                  }}
                  edgeId={rotationEdgeId}
                  onEdgeChange={(edgeId) => {
                    setRotationEdgeId(edgeId);
                    setRotationAngle(0);
                  }}
                  points={points}
                  axisPointIds={rotationAxisPoints}
                  onAxisPointChange={(index, id) => {
                    setRotationAxisPoints((previous) =>
                      index === 0 ? [id, previous[1]] : [previous[0], id],
                    );
                    setRotationAngle(0);
                  }}
                  angleDegrees={rotationAngle}
                  onAngleChange={adjustRotationAngle}
                  section={rotationPreview?.section ?? null}
                  canSave={
                    !readOnly &&
                    rotationEnabled &&
                    selectedTuple !== null &&
                    rotationAxis !== null &&
                    Math.abs(rotationAngle) >= 1e-8 &&
                    rotationPreview?.section != null &&
                    record.sections.length < 8 &&
                    record.points.length + 3 <= 32
                  }
                  onSave={saveRotation}
                />
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
                      const calculated = savedSectionResults.get(
                        sectionDefinition.id,
                      );
                      const name =
                        sectionDefinition.label ??
                        sectionNames[index] ??
                        `S${String(index + 1)}`;
                      return (
                        <li key={sectionDefinition.id}>
                          <button
                            aria-pressed={
                              activeSectionDefinition?.id ===
                              sectionDefinition.id
                            }
                            onClick={() =>
                              setActiveSectionId(sectionDefinition.id)
                            }
                            type="button"
                          >
                            {name}
                          </button>
                          <input
                            aria-label={`Имя сечения ${name}`}
                            disabled={readOnly}
                            maxLength={32}
                            onChange={(event) =>
                              onRecordChange({
                                ...record,
                                sections: record.sections.map((candidate) =>
                                  candidate.id === sectionDefinition.id
                                    ? {
                                        ...candidate,
                                        label:
                                          event.currentTarget.value.trim()
                                            .length === 0
                                            ? undefined
                                            : event.currentTarget.value,
                                      }
                                    : candidate,
                                ),
                              })
                            }
                            placeholder={name}
                            value={sectionDefinition.label ?? ""}
                          />
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
                            {calculated?.status === "ok"
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
              </div>
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
            </div>
          </aside>
        </div>
        {advancedOpen ? (
          <aside
            aria-label="Точная настройка"
            className="solid-3d-advanced"
            id="solid-3d-advanced"
            role="region"
          >
            <div className="solid-3d-advanced-heading">
              <h3>Точная настройка</h3>
              <button
                aria-label="Закрыть настройки"
                onClick={() => setAdvancedOpen(false)}
                type="button"
              >
                ×
              </button>
            </div>
            <p>
              Дополнительные параметры модели. Изменения сохраняются в
              документе.
            </p>
            <Solid3DOrientationEditor
              onRecordChange={onRecordChange}
              readOnly={readOnly}
              record={record}
            />
            <Solid3DConstructionEditor
              advancedOnly
              key={JSON.stringify(record.definition)}
              onRecordChange={onRecordChange}
              readOnly={readOnly}
              record={record}
            />
            <button
              aria-pressed={showRotationGizmo && mode === "view"}
              disabled={readOnly || mode !== "view"}
              onClick={() => setShowRotationGizmo((visible) => !visible)}
              type="button"
            >
              {showRotationGizmo && mode === "view"
                ? "Скрыть кольца поворота"
                : "Показать кольца поворота"}
            </button>
            <p className="solid-3d-advanced-hint">
              Кольца позволяют поворачивать само тело. В режиме точек они
              недоступны.
            </p>
          </aside>
        ) : null}
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
      <button
        aria-label="Изменить размер 3D-окна"
        className="solid-3d-resize-handle"
        onKeyDown={(event) => handleWindowArrow(event, "resize")}
        onPointerCancel={endWindowGesture}
        onPointerDown={(event) => startWindowGesture(event, "resize")}
        onPointerMove={moveWindowGesture}
        onPointerUp={endWindowGesture}
        title="Перетащите мышью или используйте стрелки"
        type="button"
      >
        <span aria-hidden="true">◢</span>
      </button>
    </div>
  );
}
