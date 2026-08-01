import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
  type RefObject,
} from "react";

import {
  maximumCoordinatePlotParameters,
  maximumCoordinatePlotSeries,
  plotLegendPositions,
  plotLineStyles,
  type CoordinatePlotDefinition,
  type PlotParameter,
  type PlotSeries,
  type PlotSeriesId,
} from "../core/public";
import {
  fitCoordinatePlotDefinition,
  removeCoordinatePlotParameter,
  removeCoordinatePlotSeries,
  replaceCoordinatePlotSeriesKind,
  resetCoordinatePlotViewport,
  updateCoordinatePlotParameter,
  updateCoordinatePlotSeries,
  type CoordinatePlotEditorIssue,
} from "../modules/coordinate-plot-editor/public";
import "./CoordinatePlotEditorPanel.css";

export interface CoordinatePlotEditorPanelProps {
  readonly definition: CoordinatePlotDefinition;
  readonly dirty: boolean;
  readonly fallbackFocusRef?: RefObject<HTMLElement | null>;
  readonly issues: readonly CoordinatePlotEditorIssue[];
  readonly onAddParameter: () => void;
  readonly onAddSeries: (kind: PlotSeries["kind"]) => void;
  readonly onClose: () => void;
  readonly onDefinitionChange: (definition: CoordinatePlotDefinition) => void;
  readonly onSave: () => boolean;
  readonly onSelectedSeriesChange: (seriesId: PlotSeriesId | null) => void;
  readonly readOnly: boolean;
  readonly selectedSeriesId: PlotSeriesId | null;
}

function numberValue(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nullableNumber(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function updateViewport(
  definition: CoordinatePlotDefinition,
  key: "xMax" | "xMin" | "yMax" | "yMin",
  value: number,
): CoordinatePlotDefinition {
  return {
    ...definition,
    coordinateViewport: { ...definition.coordinateViewport, [key]: value },
  };
}

function fieldIssues(
  issues: readonly CoordinatePlotEditorIssue[],
  field: string,
): readonly CoordinatePlotEditorIssue[] {
  if (field === "") return issues;
  return issues.filter(
    (issue) => issue.field === field || issue.field.startsWith(`${field}.`),
  );
}

function IssueList({
  field,
  id,
  issues,
}: {
  readonly field: string;
  readonly id?: string;
  readonly issues: readonly CoordinatePlotEditorIssue[];
}): ReactElement | null {
  const relevant = fieldIssues(issues, field);
  return relevant.length === 0 ? null : (
    <ul className="plot-editor-issues" id={id}>
      {relevant.map((issue, index) => (
        <li key={`${issue.code}-${issue.start ?? "field"}-${index}`}>
          {issue.message}
        </li>
      ))}
    </ul>
  );
}

function issueAttributes(
  issues: readonly CoordinatePlotEditorIssue[],
  field: string,
  issueId: string,
): {
  readonly "aria-describedby"?: string;
  readonly "aria-invalid"?: true;
} {
  return fieldIssues(issues, field).length === 0
    ? {}
    : { "aria-describedby": issueId, "aria-invalid": true };
}

function SeriesEditor({
  definition,
  issues,
  onChange,
  series,
}: {
  readonly definition: CoordinatePlotDefinition;
  readonly issues: readonly CoordinatePlotEditorIssue[];
  readonly onChange: (definition: CoordinatePlotDefinition) => void;
  readonly series: PlotSeries;
}): ReactElement {
  const index = definition.series.findIndex(({ id }) => id === series.id);
  const prefix = `series.${index}`;
  const expressionIssueId = `plot-series-${index}-expression-issues`;
  const domainIssueId = `plot-series-${index}-domain-issues`;
  const xExpressionIssueId = `plot-series-${index}-x-expression-issues`;
  const yExpressionIssueId = `plot-series-${index}-y-expression-issues`;
  const rangeIssueId = `plot-series-${index}-range-issues`;
  const replace = (replacement: PlotSeries) =>
    onChange(updateCoordinatePlotSeries(definition, replacement));
  return (
    <div className="plot-series-editor" data-series-kind={series.kind}>
      <div className="plot-editor-grid two-columns">
        <label>
          Название
          <input
            maxLength={120}
            onChange={(event) =>
              replace({ ...series, name: event.currentTarget.value })
            }
            value={series.name}
          />
        </label>
        <label>
          Тип
          <select
            onChange={(event) =>
              onChange(
                replaceCoordinatePlotSeriesKind(
                  definition,
                  series.id,
                  event.currentTarget.value as PlotSeries["kind"],
                ),
              )
            }
            value={series.kind}
          >
            <option value="explicit">y = f(x)</option>
            <option value="parametric">Параметрическая</option>
          </select>
        </label>
      </div>

      {series.kind === "explicit" ? (
        <>
          <label>
            Формула y =
            <input
              {...issueAttributes(
                issues,
                `${prefix}.expression`,
                expressionIssueId,
              )}
              aria-label="Формула явной функции"
              data-plot-editor-initial-focus
              maxLength={2_000}
              onChange={(event) =>
                replace({ ...series, expression: event.currentTarget.value })
              }
              spellCheck={false}
              value={series.expression}
            />
          </label>
          <IssueList
            field={`${prefix}.expression`}
            id={expressionIssueId}
            issues={issues}
          />
          <div className="plot-editor-grid two-columns">
            <label>
              X от
              <input
                {...issueAttributes(issues, `${prefix}.domain`, domainIssueId)}
                aria-label="Минимум области явной функции"
                maxLength={2_000}
                onChange={(event) =>
                  replace({
                    ...series,
                    domain: {
                      ...series.domain,
                      minExpression:
                        event.currentTarget.value.trim() === ""
                          ? null
                          : event.currentTarget.value,
                    },
                  })
                }
                placeholder="авто"
                spellCheck={false}
                value={series.domain.minExpression ?? ""}
              />
            </label>
            <label>
              X до
              <input
                {...issueAttributes(issues, `${prefix}.domain`, domainIssueId)}
                aria-label="Максимум области явной функции"
                maxLength={2_000}
                onChange={(event) =>
                  replace({
                    ...series,
                    domain: {
                      ...series.domain,
                      maxExpression:
                        event.currentTarget.value.trim() === ""
                          ? null
                          : event.currentTarget.value,
                    },
                  })
                }
                placeholder="авто"
                spellCheck={false}
                value={series.domain.maxExpression ?? ""}
              />
            </label>
          </div>
          <IssueList
            field={`${prefix}.domain`}
            id={domainIssueId}
            issues={issues}
          />
        </>
      ) : (
        <>
          <label>
            x(t)
            <input
              {...issueAttributes(
                issues,
                `${prefix}.xExpression`,
                xExpressionIssueId,
              )}
              aria-label="Параметрическая формула x"
              data-plot-editor-initial-focus
              maxLength={2_000}
              onChange={(event) =>
                replace({ ...series, xExpression: event.currentTarget.value })
              }
              spellCheck={false}
              value={series.xExpression}
            />
          </label>
          <IssueList
            field={`${prefix}.xExpression`}
            id={xExpressionIssueId}
            issues={issues}
          />
          <label>
            y(t)
            <input
              {...issueAttributes(
                issues,
                `${prefix}.yExpression`,
                yExpressionIssueId,
              )}
              aria-label="Параметрическая формула y"
              maxLength={2_000}
              onChange={(event) =>
                replace({ ...series, yExpression: event.currentTarget.value })
              }
              spellCheck={false}
              value={series.yExpression}
            />
          </label>
          <IssueList
            field={`${prefix}.yExpression`}
            id={yExpressionIssueId}
            issues={issues}
          />
          <div className="plot-editor-grid two-columns">
            <label>
              t от
              <input
                {...issueAttributes(issues, `${prefix}.range`, rangeIssueId)}
                aria-label="Минимум параметра t"
                maxLength={2_000}
                onChange={(event) =>
                  replace({
                    ...series,
                    range: {
                      ...series.range,
                      minExpression: event.currentTarget.value,
                    },
                  })
                }
                spellCheck={false}
                value={series.range.minExpression}
              />
            </label>
            <label>
              t до
              <input
                {...issueAttributes(issues, `${prefix}.range`, rangeIssueId)}
                aria-label="Максимум параметра t"
                maxLength={2_000}
                onChange={(event) =>
                  replace({
                    ...series,
                    range: {
                      ...series.range,
                      maxExpression: event.currentTarget.value,
                    },
                  })
                }
                spellCheck={false}
                value={series.range.maxExpression}
              />
            </label>
          </div>
          <IssueList
            field={`${prefix}.range`}
            id={rangeIssueId}
            issues={issues}
          />
          <label className="plot-editor-check">
            <input
              checked={series.closed}
              onChange={(event) =>
                replace({ ...series, closed: event.currentTarget.checked })
              }
              type="checkbox"
            />
            Замкнуть кривую
          </label>
        </>
      )}

      <div className="plot-editor-grid style-grid">
        <label>
          Цвет
          <input
            aria-label="Цвет серии"
            onChange={(event) =>
              replace({
                ...series,
                style: { ...series.style, stroke: event.currentTarget.value },
              })
            }
            type="color"
            value={series.style.stroke}
          />
        </label>
        <label>
          Толщина
          <input
            max="20"
            min="0.5"
            onChange={(event) =>
              replace({
                ...series,
                style: {
                  ...series.style,
                  strokeWidth: numberValue(
                    event.currentTarget.value,
                    series.style.strokeWidth,
                  ),
                },
              })
            }
            step="0.5"
            type="number"
            value={series.style.strokeWidth}
          />
        </label>
        <label>
          Линия
          <select
            onChange={(event) =>
              replace({
                ...series,
                style: {
                  ...series.style,
                  lineStyle: event.currentTarget
                    .value as PlotSeries["style"]["lineStyle"],
                },
              })
            }
            value={series.style.lineStyle}
          >
            {plotLineStyles.map((lineStyle) => (
              <option key={lineStyle} value={lineStyle}>
                {lineStyle}
              </option>
            ))}
          </select>
        </label>
        <label>
          Прозрачность
          <input
            max="1"
            min="0"
            onChange={(event) =>
              replace({
                ...series,
                style: {
                  ...series.style,
                  opacity: numberValue(
                    event.currentTarget.value,
                    series.style.opacity,
                  ),
                },
              })
            }
            step="0.05"
            type="range"
            value={series.style.opacity}
          />
        </label>
      </div>
    </div>
  );
}

function ParameterEditor({
  definition,
  onChange,
  parameter,
}: {
  readonly definition: CoordinatePlotDefinition;
  readonly onChange: (definition: CoordinatePlotDefinition) => void;
  readonly parameter: PlotParameter;
}): ReactElement {
  const replace = (replacement: PlotParameter) =>
    onChange(updateCoordinatePlotParameter(definition, replacement));
  const sliderAvailable =
    parameter.min !== null &&
    parameter.max !== null &&
    parameter.step !== null &&
    parameter.min < parameter.max &&
    parameter.step > 0;
  return (
    <div className="plot-parameter-row">
      <div className="plot-editor-grid parameter-grid">
        <label>
          Имя
          <input
            aria-label={`Имя параметра ${parameter.id}`}
            maxLength={32}
            onChange={(event) =>
              replace({ ...parameter, name: event.currentTarget.value })
            }
            value={parameter.name}
          />
        </label>
        <label>
          Значение
          <input
            onChange={(event) =>
              replace({
                ...parameter,
                value: numberValue(event.currentTarget.value, parameter.value),
              })
            }
            step="any"
            type="number"
            value={parameter.value}
          />
        </label>
        <label>
          Min
          <input
            onChange={(event) =>
              replace({
                ...parameter,
                min: nullableNumber(event.currentTarget.value),
              })
            }
            step="any"
            type="number"
            value={parameter.min ?? ""}
          />
        </label>
        <label>
          Max
          <input
            onChange={(event) =>
              replace({
                ...parameter,
                max: nullableNumber(event.currentTarget.value),
              })
            }
            step="any"
            type="number"
            value={parameter.max ?? ""}
          />
        </label>
        <label>
          Шаг
          <input
            min="0"
            onChange={(event) =>
              replace({
                ...parameter,
                step: nullableNumber(event.currentTarget.value),
              })
            }
            step="any"
            type="number"
            value={parameter.step ?? ""}
          />
        </label>
        <button
          aria-label={`Удалить параметр ${parameter.name}`}
          onClick={() =>
            onChange(removeCoordinatePlotParameter(definition, parameter.id))
          }
          type="button"
        >
          Удалить
        </button>
      </div>
      {sliderAvailable ? (
        <input
          aria-label={`Ползунок параметра ${parameter.name}`}
          className="plot-parameter-slider"
          max={parameter.max}
          min={parameter.min}
          onChange={(event) =>
            replace({
              ...parameter,
              value: numberValue(event.currentTarget.value, parameter.value),
            })
          }
          step={parameter.step}
          type="range"
          value={Math.max(
            parameter.min,
            Math.min(parameter.max, parameter.value),
          )}
        />
      ) : null}
    </div>
  );
}

export function CoordinatePlotEditorPanel({
  definition,
  dirty,
  fallbackFocusRef,
  issues,
  onAddParameter,
  onAddSeries,
  onClose,
  onDefinitionChange,
  onSave,
  onSelectedSeriesChange,
  readOnly,
  selectedSeriesId,
}: CoordinatePlotEditorPanelProps): ReactElement {
  const editorId = useId();
  const editorRef = useRef<HTMLElement>(null);
  const confirmationReturnFocusRef = useRef<HTMLElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(
    typeof document !== "undefined" &&
      document.activeElement instanceof HTMLElement &&
      document.activeElement !== document.body
      ? document.activeElement
      : null,
  );
  const [closeConfirmationOpen, setCloseConfirmationOpen] = useState(false);
  const selectedSeries =
    definition.series.find(({ id }) => id === selectedSeriesId) ??
    definition.series[0] ??
    null;
  const blockingIssues = issues.filter(({ blocking }) => blocking);
  const expressionIssues = issues.filter(({ blocking }) => !blocking);
  const canSave = dirty && !readOnly && blockingIssues.length === 0;
  const viewportIssueId = `${editorId}-viewport-issues`;
  const gridIssueId = `${editorId}-grid-issues`;

  const focusEditor = useCallback((preferred: HTMLElement | null = null) => {
    const target =
      preferred?.isConnected === true
        ? preferred
        : (editorRef.current?.querySelector<HTMLElement>(
            "[data-plot-editor-initial-focus]",
          ) ?? editorRef.current);
    target?.focus();
  }, []);

  const requestClose = useCallback(() => {
    if (!dirty) {
      onClose();
      return;
    }
    confirmationReturnFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setCloseConfirmationOpen(true);
  }, [dirty, onClose]);

  const continueEditing = useCallback(() => {
    const preferred = confirmationReturnFocusRef.current;
    setCloseConfirmationOpen(false);
    queueMicrotask(() => focusEditor(preferred));
  }, [focusEditor]);

  useEffect(() => {
    let mounted = true;
    const original = returnFocusRef.current;
    const fallback = fallbackFocusRef?.current ?? null;
    queueMicrotask(() => {
      if (mounted) focusEditor();
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
  }, [fallbackFocusRef, focusEditor]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const accelerator = event.ctrlKey || event.metaKey;
      if (accelerator && !event.altKey && event.key === "Enter") {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (canSave) onSave();
        return;
      }
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (closeConfirmationOpen) {
        continueEditing();
      } else {
        requestClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canSave, closeConfirmationOpen, continueEditing, onSave, requestClose]);

  return (
    <aside
      aria-describedby={`${editorId}-status`}
      aria-label="Редактор координатной плоскости"
      className="coordinate-plot-editor-panel"
      data-testid="coordinate-plot-editor"
      ref={editorRef}
      tabIndex={-1}
    >
      <header className="plot-editor-heading">
        <div>
          <strong id={`${editorId}-title`}>
            Редактирование координатной плоскости
          </strong>
          <span aria-live="polite" id={`${editorId}-status`}>
            {dirty ? "Есть несохранённые изменения" : "Изменения сохранены"}
          </span>
        </div>
        <button
          aria-label="Закрыть редактор графика"
          onClick={requestClose}
          type="button"
        >
          <span aria-hidden="true">×</span>
        </button>
      </header>

      <div className="plot-editor-scroll">
        <details open>
          <summary>Координатная система</summary>
          <div className="plot-editor-section">
            <div className="plot-editor-grid viewport-grid">
              {(["xMin", "xMax", "yMin", "yMax"] as const).map((key) => (
                <label key={key}>
                  {key}
                  <input
                    {...issueAttributes(
                      issues,
                      "coordinateViewport",
                      viewportIssueId,
                    )}
                    aria-label={`Граница ${key}`}
                    onChange={(event) =>
                      onDefinitionChange(
                        updateViewport(
                          definition,
                          key,
                          numberValue(
                            event.currentTarget.value,
                            definition.coordinateViewport[key],
                          ),
                        ),
                      )
                    }
                    step="any"
                    type="number"
                    value={definition.coordinateViewport[key]}
                  />
                </label>
              ))}
            </div>
            <label className="plot-editor-check">
              <input
                checked={definition.coordinateViewport.equalScale}
                onChange={(event) =>
                  onDefinitionChange({
                    ...definition,
                    coordinateViewport: {
                      ...definition.coordinateViewport,
                      equalScale: event.currentTarget.checked,
                    },
                  })
                }
                type="checkbox"
              />
              Одинаковый масштаб осей
            </label>
            <div className="plot-editor-actions compact">
              <button
                onClick={() =>
                  onDefinitionChange(fitCoordinatePlotDefinition(definition))
                }
                type="button"
              >
                Вместить графики
              </button>
              <button
                onClick={() =>
                  onDefinitionChange(resetCoordinatePlotViewport(definition))
                }
                type="button"
              >
                Стандартный масштаб
              </button>
            </div>
            <p className="plot-editor-hint">
              На плоскости: перетаскивание сдвигает диапазон, колесо
              масштабирует, Shift+колесо меняет X, Alt+колесо меняет Y.
            </p>
            <IssueList
              field="coordinateViewport"
              id={viewportIssueId}
              issues={issues}
            />
          </div>
        </details>

        <details>
          <summary>Сетка, оси и легенда</summary>
          <div className="plot-editor-section">
            <div className="plot-editor-checks">
              <label>
                <input
                  checked={definition.grid.visible}
                  onChange={(event) =>
                    onDefinitionChange({
                      ...definition,
                      grid: {
                        ...definition.grid,
                        visible: event.currentTarget.checked,
                      },
                    })
                  }
                  type="checkbox"
                />
                Сетка
              </label>
              <label>
                <input
                  checked={definition.grid.majorVisible}
                  onChange={(event) =>
                    onDefinitionChange({
                      ...definition,
                      grid: {
                        ...definition.grid,
                        majorVisible: event.currentTarget.checked,
                      },
                    })
                  }
                  type="checkbox"
                />
                Основные линии
              </label>
              <label>
                <input
                  checked={definition.grid.minorVisible}
                  onChange={(event) =>
                    onDefinitionChange({
                      ...definition,
                      grid: {
                        ...definition.grid,
                        minorVisible: event.currentTarget.checked,
                      },
                    })
                  }
                  type="checkbox"
                />
                Промежуточные линии
              </label>
              <label>
                <input
                  checked={definition.grid.automaticStep}
                  onChange={(event) =>
                    onDefinitionChange({
                      ...definition,
                      grid: {
                        ...definition.grid,
                        automaticStep: event.currentTarget.checked,
                        xStep: event.currentTarget.checked
                          ? null
                          : (definition.grid.xStep ?? 1),
                        yStep: event.currentTarget.checked
                          ? null
                          : (definition.grid.yStep ?? 1),
                      },
                    })
                  }
                  type="checkbox"
                />
                Автоматический шаг
              </label>
              <label>
                <input
                  checked={definition.axes.showXAxis}
                  onChange={(event) =>
                    onDefinitionChange({
                      ...definition,
                      axes: {
                        ...definition.axes,
                        showXAxis: event.currentTarget.checked,
                      },
                    })
                  }
                  type="checkbox"
                />
                Ось X
              </label>
              <label>
                <input
                  checked={definition.axes.showYAxis}
                  onChange={(event) =>
                    onDefinitionChange({
                      ...definition,
                      axes: {
                        ...definition.axes,
                        showYAxis: event.currentTarget.checked,
                      },
                    })
                  }
                  type="checkbox"
                />
                Ось Y
              </label>
              <label>
                <input
                  checked={definition.axes.showLabels}
                  onChange={(event) =>
                    onDefinitionChange({
                      ...definition,
                      axes: {
                        ...definition.axes,
                        showLabels: event.currentTarget.checked,
                      },
                    })
                  }
                  type="checkbox"
                />
                Подписи
              </label>
              <label>
                <input
                  checked={definition.axes.showArrows}
                  onChange={(event) =>
                    onDefinitionChange({
                      ...definition,
                      axes: {
                        ...definition.axes,
                        showArrows: event.currentTarget.checked,
                      },
                    })
                  }
                  type="checkbox"
                />
                Стрелки
              </label>
              <label>
                <input
                  checked={definition.legend.visible}
                  onChange={(event) =>
                    onDefinitionChange({
                      ...definition,
                      legend: {
                        ...definition.legend,
                        visible: event.currentTarget.checked,
                      },
                    })
                  }
                  type="checkbox"
                />
                Легенда
              </label>
            </div>
            {definition.grid.automaticStep ? null : (
              <div className="plot-editor-grid two-columns">
                <label>
                  Шаг X
                  <input
                    {...issueAttributes(issues, "grid", gridIssueId)}
                    min="0.000000001"
                    onChange={(event) =>
                      onDefinitionChange({
                        ...definition,
                        grid: {
                          ...definition.grid,
                          xStep: numberValue(
                            event.currentTarget.value,
                            definition.grid.xStep ?? 1,
                          ),
                        },
                      })
                    }
                    step="any"
                    type="number"
                    value={definition.grid.xStep ?? 1}
                  />
                </label>
                <label>
                  Шаг Y
                  <input
                    {...issueAttributes(issues, "grid", gridIssueId)}
                    min="0.000000001"
                    onChange={(event) =>
                      onDefinitionChange({
                        ...definition,
                        grid: {
                          ...definition.grid,
                          yStep: numberValue(
                            event.currentTarget.value,
                            definition.grid.yStep ?? 1,
                          ),
                        },
                      })
                    }
                    step="any"
                    type="number"
                    value={definition.grid.yStep ?? 1}
                  />
                </label>
              </div>
            )}
            <div className="plot-editor-grid two-columns">
              <label>
                Подпись X
                <input
                  maxLength={24}
                  onChange={(event) =>
                    onDefinitionChange({
                      ...definition,
                      axes: {
                        ...definition.axes,
                        xLabel: event.currentTarget.value,
                      },
                    })
                  }
                  value={definition.axes.xLabel}
                />
              </label>
              <label>
                Подпись Y
                <input
                  maxLength={24}
                  onChange={(event) =>
                    onDefinitionChange({
                      ...definition,
                      axes: {
                        ...definition.axes,
                        yLabel: event.currentTarget.value,
                      },
                    })
                  }
                  value={definition.axes.yLabel}
                />
              </label>
            </div>
            <label>
              Положение легенды
              <select
                onChange={(event) =>
                  onDefinitionChange({
                    ...definition,
                    legend: {
                      ...definition.legend,
                      position: event.currentTarget
                        .value as CoordinatePlotDefinition["legend"]["position"],
                    },
                  })
                }
                value={definition.legend.position}
              >
                {plotLegendPositions.map((position) => (
                  <option key={position} value={position}>
                    {position}
                  </option>
                ))}
              </select>
            </label>
            <IssueList field="grid" id={gridIssueId} issues={issues} />
          </div>
        </details>

        <details open>
          <summary>Серии ({definition.series.length})</summary>
          <div className="plot-editor-section">
            <div className="plot-editor-actions compact">
              <button
                disabled={
                  definition.series.length >= maximumCoordinatePlotSeries
                }
                onClick={() => onAddSeries("explicit")}
                type="button"
              >
                + y=f(x)
              </button>
              <button
                disabled={
                  definition.series.length >= maximumCoordinatePlotSeries
                }
                onClick={() => onAddSeries("parametric")}
                type="button"
              >
                + Параметрическая
              </button>
            </div>
            <ol className="plot-series-list">
              {definition.series.map((series) => (
                <li
                  className={
                    series.id === selectedSeries?.id ? "is-selected" : ""
                  }
                  key={series.id}
                >
                  <input
                    aria-label={`Показывать ${series.name}`}
                    checked={series.visible}
                    onChange={(event) =>
                      onDefinitionChange(
                        updateCoordinatePlotSeries(definition, {
                          ...series,
                          visible: event.currentTarget.checked,
                        }),
                      )
                    }
                    type="checkbox"
                  />
                  <button
                    className="plot-series-name"
                    onClick={() => onSelectedSeriesChange(series.id)}
                    type="button"
                  >
                    {series.name || "Без названия"}
                  </button>
                  <button
                    aria-label={`Удалить серию ${
                      series.name || `№${definition.series.indexOf(series) + 1}`
                    }`}
                    onClick={() => {
                      const next = removeCoordinatePlotSeries(
                        definition,
                        series.id,
                      );
                      onDefinitionChange(next);
                      if (selectedSeriesId === series.id)
                        onSelectedSeriesChange(next.series[0]?.id ?? null);
                    }}
                    type="button"
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </li>
              ))}
            </ol>
            {selectedSeries === null ? (
              <p>Добавьте первую серию.</p>
            ) : (
              <SeriesEditor
                definition={definition}
                issues={issues}
                onChange={onDefinitionChange}
                series={selectedSeries}
              />
            )}
          </div>
        </details>

        <details>
          <summary>Параметры ({definition.parameters.length})</summary>
          <div className="plot-editor-section">
            <button
              disabled={
                definition.parameters.length >= maximumCoordinatePlotParameters
              }
              onClick={onAddParameter}
              type="button"
            >
              Добавить параметр
            </button>
            {definition.parameters.length === 0 ? (
              <p className="plot-editor-hint">
                Параметры общие для всех серий. Пример: y=a*x^2+b.
              </p>
            ) : (
              definition.parameters.map((parameter) => (
                <ParameterEditor
                  definition={definition}
                  key={parameter.id}
                  onChange={onDefinitionChange}
                  parameter={parameter}
                />
              ))
            )}
            <IssueList field="parameters" issues={issues} />
          </div>
        </details>

        {expressionIssues.length === 0 ? null : (
          <div className="plot-editor-warning" role="status">
            В формулах найдено предупреждений: {expressionIssues.length}.
            Остальные серии продолжают отображаться.
          </div>
        )}
        {blockingIssues.length === 0 ? null : (
          <div className="plot-editor-error" role="alert">
            Исправьте структурные ошибки перед сохранением.
            <IssueList field="" issues={blockingIssues} />
          </div>
        )}
      </div>

      <footer className="plot-editor-footer">
        <button onClick={requestClose} type="button">
          Закрыть
        </button>
        <button
          className="primary"
          disabled={!canSave}
          onClick={() => {
            onSave();
          }}
          type="button"
        >
          Сохранить
        </button>
      </footer>

      {closeConfirmationOpen ? (
        <div className="plot-editor-confirmation-backdrop">
          <section
            aria-describedby={`${editorId}-close-description`}
            aria-labelledby={`${editorId}-close-title`}
            aria-modal="true"
            className="plot-editor-confirmation"
            onKeyDown={(event) => {
              if (event.key !== "Tab") return;
              const buttons = [
                ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                  "button:not(:disabled)",
                ),
              ];
              if (buttons.length === 0) return;
              const activeIndex = buttons.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              const nextIndex = event.shiftKey
                ? activeIndex <= 0
                  ? buttons.length - 1
                  : activeIndex - 1
                : activeIndex === buttons.length - 1
                  ? 0
                  : activeIndex + 1;
              event.preventDefault();
              buttons[nextIndex]?.focus();
            }}
            role="alertdialog"
          >
            <h2 id={`${editorId}-close-title`}>Несохранённые изменения</h2>
            <p id={`${editorId}-close-description`}>
              Черновик координатной плоскости изменён. Выберите, как завершить
              редактирование.
            </p>
            {blockingIssues.length > 0 ? (
              <p className="plot-editor-confirmation-note" role="status">
                Сохранение станет доступно после исправления структурных ошибок.
              </p>
            ) : null}
            <div className="plot-editor-confirmation-actions">
              <button autoFocus onClick={continueEditing} type="button">
                Продолжить редактирование
              </button>
              <button className="danger" onClick={onClose} type="button">
                Закрыть без сохранения
              </button>
              <button
                className="primary"
                disabled={!canSave}
                onClick={() => {
                  if (onSave()) onClose();
                }}
                type="button"
              >
                Сохранить и закрыть
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </aside>
  );
}
