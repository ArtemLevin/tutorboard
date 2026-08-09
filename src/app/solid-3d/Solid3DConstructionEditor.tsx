import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactElement,
  type SetStateAction,
} from "react";

import {
  constructionKindFromDefinition,
  constructionSideCount,
  definitionForSolidConstruction,
  replaceSolidConstructionBase,
  replaceSolidConstructionDefinition,
  validateSolidConstructionBase,
  type Solid3DRecord,
  type SolidConstructionKind,
  type Vec2,
} from "../../core/public";
import "./Solid3DConstructionEditor.css";

export interface Solid3DConstructionEditorProps {
  readonly onRecordChange: (replacement: Solid3DRecord) => void;
  readonly readOnly: boolean;
  readonly record: Solid3DRecord;
}

const labels: Readonly<Record<SolidConstructionKind, string>> = {
  cone: "Конус",
  cube: "Куб",
  cuboid: "Прямоугольный параллелепипед",
  cylinder: "Цилиндр",
  dodecahedron: "Додекаэдр",
  hemisphere: "Полусфера",
  icosahedron: "Икосаэдр",
  octahedron: "Октаэдр",
  prism: "Призма",
  pyramid: "Пирамида",
  sphere: "Сфера",
  tetrahedron: "Тетраэдр",
  "truncated-cone": "Усечённый конус",
  "truncated-pyramid": "Усечённая пирамида",
};

const kinds = Object.keys(labels) as SolidConstructionKind[];

function baseFromRecord(record: Solid3DRecord): readonly Vec2[] | null {
  switch (record.definition.kind) {
    case "prism":
    case "pyramid":
      return record.definition.base;
    case "truncated-pyramid":
      return record.definition.bottomBase;
    default:
      return null;
  }
}

function topBaseFromRecord(record: Solid3DRecord): readonly Vec2[] | null {
  return record.definition.kind === "truncated-pyramid"
    ? record.definition.topBase
    : null;
}

const cloneBase = (base: readonly Vec2[]): Vec2[] =>
  base.map((point) => ({ x: point.x, y: point.y }));

export function Solid3DConstructionEditor({
  onRecordChange,
  readOnly,
  record,
}: Solid3DConstructionEditorProps): ReactElement {
  const kind = constructionKindFromDefinition(record.definition);
  const sideCount = constructionSideCount(record.definition);
  const currentBase = baseFromRecord(record);
  const currentTopBase = topBaseFromRecord(record);
  const [customBase, setCustomBase] = useState(false);
  const [draftBase, setDraftBase] = useState<Vec2[]>(() =>
    cloneBase(currentBase ?? []),
  );
  const [draftTopBase, setDraftTopBase] = useState<Vec2[]>(() =>
    cloneBase(currentTopBase ?? []),
  );
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setDraftBase(cloneBase(currentBase ?? []));
    setDraftTopBase(cloneBase(currentTopBase ?? []));
    setMessage(null);
  }, [record.definition]);

  const supportsBase = currentBase !== null;
  const validation = useMemo(
    () => validateSolidConstructionBase(draftBase),
    [draftBase],
  );
  const topValidation = useMemo(
    () =>
      draftTopBase.length === 0
        ? null
        : validateSolidConstructionBase(draftTopBase),
    [draftTopBase],
  );

  const changeKind = (next: SolidConstructionKind): void => {
    onRecordChange(
      replaceSolidConstructionDefinition(
        record,
        definitionForSolidConstruction(next, sideCount ?? 4),
      ),
    );
    setCustomBase(false);
  };

  const changeSides = (value: number): void => {
    if (!Number.isInteger(value) || value < 3 || value > 32) {
      setMessage("Количество сторон должно быть целым числом от 3 до 32.");
      return;
    }
    onRecordChange(
      replaceSolidConstructionDefinition(
        record,
        definitionForSolidConstruction(kind, value),
      ),
    );
    setMessage(null);
  };

  const updatePoint = (
    setBase: Dispatch<SetStateAction<Vec2[]>>,
    index: number,
    axis: "x" | "y",
    value: string,
  ): void => {
    if (value.trim().length === 0) return;
    const numeric = Number(value.replace(",", "."));
    if (!Number.isFinite(numeric)) return;
    setBase((current) =>
      current.map((point, candidate) =>
        candidate === index ? { ...point, [axis]: numeric } : point,
      ),
    );
  };

  const addVertex = (): void => {
    if (draftBase.length >= 32) return;
    const previous = draftBase.at(-1) ?? { x: -1, y: 0 };
    const first = draftBase[0] ?? { x: 1, y: 0 };
    setDraftBase((current) => [
      ...current,
      { x: (previous.x + first.x) / 2, y: (previous.y + first.y) / 2 },
    ]);
    if (record.definition.kind === "truncated-pyramid") {
      const topPrevious = draftTopBase.at(-1) ?? { x: -0.5, y: 0 };
      const topFirst = draftTopBase[0] ?? { x: 0.5, y: 0 };
      setDraftTopBase((current) => [
        ...current,
        {
          x: (topPrevious.x + topFirst.x) / 2,
          y: (topPrevious.y + topFirst.y) / 2,
        },
      ]);
    }
  };

  const removeVertex = (index: number): void => {
    if (draftBase.length <= 3) return;
    setDraftBase((current) =>
      current.filter((_, candidate) => candidate !== index),
    );
    setDraftTopBase((current) =>
      current.filter((_, candidate) => candidate !== index),
    );
  };

  const applyBase = (): void => {
    const replacement = replaceSolidConstructionBase(
      record,
      draftBase,
      record.definition.kind === "truncated-pyramid"
        ? draftTopBase
        : undefined,
    );
    if (replacement === null) {
      setMessage(
        "Основание должно иметь ненулевую площадь и не пересекать само себя.",
      );
      return;
    }
    onRecordChange(replacement);
    setMessage(null);
  };

  return (
    <section
      aria-labelledby="solid-3d-construction-title"
      className="solid-3d-construction"
    >
      <h3 id="solid-3d-construction-title">Конструкция тела</h3>
      <label>
        <span>Тип</span>
        <select
          aria-label="Тип объёмного тела"
          disabled={readOnly}
          onChange={(event) =>
            changeKind(event.currentTarget.value as SolidConstructionKind)
          }
          value={kind}
        >
          {kinds.map((item) => (
            <option key={item} value={item}>
              {labels[item]}
            </option>
          ))}
        </select>
      </label>
      {sideCount === null ? null : (
        <label>
          <span>Сторон основания</span>
          <input
            aria-label="Количество сторон основания"
            defaultValue={sideCount}
            disabled={readOnly || customBase}
            max={32}
            min={3}
            onBlur={(event) => changeSides(Number(event.currentTarget.value))}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            type="number"
          />
        </label>
      )}
      {supportsBase ? (
        <label className="solid-3d-construction-mode">
          <input
            checked={customBase}
            disabled={readOnly}
            onChange={(event) => setCustomBase(event.currentTarget.checked)}
            type="checkbox"
          />
          Произвольное основание
        </label>
      ) : null}
      {supportsBase && customBase ? (
        <div className="solid-3d-base-editor">
          <div className="solid-3d-base-editor-heading">
            <strong>Нижнее основание</strong>
            <button
              disabled={readOnly || draftBase.length >= 32}
              onClick={addVertex}
              type="button"
            >
              + вершина
            </button>
          </div>
          {draftBase.map((point, index) => (
            <div className="solid-3d-base-row" key={`bottom-${String(index)}`}>
              <span>{String(index + 1)}</span>
              <input
                aria-label={`X вершины ${String(index + 1)}`}
                disabled={readOnly}
                onChange={(event) =>
                  updatePoint(
                    setDraftBase,
                    index,
                    "x",
                    event.currentTarget.value,
                  )
                }
                step="0.1"
                type="number"
                value={point.x}
              />
              <input
                aria-label={`Z вершины ${String(index + 1)}`}
                disabled={readOnly}
                onChange={(event) =>
                  updatePoint(
                    setDraftBase,
                    index,
                    "y",
                    event.currentTarget.value,
                  )
                }
                step="0.1"
                type="number"
                value={point.y}
              />
              <button
                aria-label={`Удалить вершину ${String(index + 1)}`}
                disabled={readOnly || draftBase.length <= 3}
                onClick={() => removeVertex(index)}
                type="button"
              >
                ×
              </button>
            </div>
          ))}
          {record.definition.kind === "truncated-pyramid" ? (
            <>
              <strong>Верхнее основание</strong>
              {draftTopBase.map((point, index) => (
                <div className="solid-3d-base-row" key={`top-${String(index)}`}>
                  <span>{String(index + 1)}</span>
                  <input
                    aria-label={`X верхней вершины ${String(index + 1)}`}
                    disabled={readOnly}
                    onChange={(event) =>
                      updatePoint(
                        setDraftTopBase,
                        index,
                        "x",
                        event.currentTarget.value,
                      )
                    }
                    step="0.1"
                    type="number"
                    value={point.x}
                  />
                  <input
                    aria-label={`Z верхней вершины ${String(index + 1)}`}
                    disabled={readOnly}
                    onChange={(event) =>
                      updatePoint(
                        setDraftTopBase,
                        index,
                        "y",
                        event.currentTarget.value,
                      )
                    }
                    step="0.1"
                    type="number"
                    value={point.y}
                  />
                  <span />
                </div>
              ))}
            </>
          ) : null}
          <button
            disabled={
              readOnly ||
              !validation.valid ||
              (topValidation !== null && !topValidation.valid) ||
              (draftTopBase.length > 0 &&
                draftTopBase.length !== draftBase.length)
            }
            onClick={applyBase}
            type="button"
          >
            Применить основание
          </button>
        </div>
      ) : null}
      {message === null ? null : (
        <p className="solid-3d-error" role="alert">
          {message}
        </p>
      )}
    </section>
  );
}
