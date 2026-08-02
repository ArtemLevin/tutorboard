import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
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

type CoordinatePlotEditorTab = "functions" | "parameters" | "view";
type QuickExpressionToken = "abs" | "cos" | "pi" | "sin" | "sqrt";

const editorTabs: readonly {
  readonly id: CoordinatePlotEditorTab;
  readonly label: string;
}[] = [
  { id: "functions", label: "Функции" },
  { id: "parameters", label: "Параметры" },
  { id: "view", label: "Вид" },
];

const quickExpressionTokens: readonly QuickExpressionToken[] = [
  "sin",
  "cos",
  "sqrt",
  "abs",
  "pi",
];

const lineStyleLabels: Readonly<
  Record<PlotSeries["style"]["lineStyle"], string>
> = {
  "dash-dot": "Штрихпунктирная",
  dashed: "Штриховая",
  solid: "Сплошная",
};

const legendPositionLabels: Readonly<
  Record<CoordinatePlotDefinition["legend"]["position"], string>
> = {
  "bottom-left": "Снизу слева",
  "bottom-right": "Снизу справа",
  "top-left": "Сверху слева",
  "top-right": "Сверху справа",
};

export interface CoordinatePlotEditorPanelProps {
  readonly definition: CoordinatePlotDefinition;
  readonly dirty: boolean;
  readonly fallbackFocusRef?: RefObject<HTMLElement | null>;
  readonly issues: readonly CoordinatePlotEditorIssue[];
  readonly onAddParameter: (name?: string) => void;
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

function NumberDraftInput({
  inputProps = {},
  nullable = false,
  onCommit,
  value,
}: {
  readonly inputProps?: Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "onBlur" | "onChange" | "onKeyDown" | "type" | "value"
  >;
  readonly nullable?: boolean;
  readonly onCommit: (value: number | null) => void;
  readonly value: number | null;
}): ReactElement {
  const format = (current: number | null) =>
    current === null ? "" : String(current);
  const [draft, setDraft] = useState(() => format(value));
  const focusedRef = useRef(false);
  useEffect(() => {
    if (!focusedRef.current) setDraft(format(value));
  }, [value]);

  const commit = () => {
    const trimmed = draft.trim();
    if (nullable && trimmed === "") {
      onCommit(null);
      return;
    }
    const parsed = Number(trimmed);
    if (trimmed !== "" && Number.isFinite(parsed)) {
      onCommit(parsed);
      setDraft(String(parsed));
      return;
    }
    setDraft(format(value));
  };

  return (
    <input
      {...inputProps}
      inputMode="decimal"
      onBlur={() => {
        focusedRef.current = false;
        commit();
      }}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onFocus={() => {
        focusedRef.current = true;
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      type="text"
      value={draft}
    />
  );
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
  includeDescendants = true,
): readonly CoordinatePlotEditorIssue[] {
  if (field === "") return issues;
  return issues.filter(
    (issue) =>
      issue.field === field ||
      (includeDescendants && issue.field.startsWith(`${field}.`)),
  );
}

function IssueList({
  field,
  id,
  includeDescendants = true,
  issues,
}: {
  readonly field: string;
  readonly id?: string;
  readonly includeDescendants?: boolean;
  readonly issues: readonly CoordinatePlotEditorIssue[];
}): ReactElement | null {
  const relevant = fieldIssues(issues, field, includeDescendants);
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
  includeDescendants = true,
): {
  readonly "aria-describedby"?: string;
  readonly "aria-invalid"?: true;
} {
  return fieldIssues(issues, field, includeDescendants).length === 0
    ? {}
    : { "aria-describedby": issueId, "aria-invalid": true };
}

function unknownParameterNames(
  issues: readonly CoordinatePlotEditorIssue[],
  field: string,
  source: string,
  existingNames: readonly string[],
): readonly string[] {
  const existing = new Set(existingNames);
  return [
    ...new Set(
      fieldIssues(issues, field, false).flatMap((issue) => {
        if (
          issue.code !== "expression.unknown-identifier" ||
          issue.start === null ||
          issue.end === null ||
          issue.start < 0 ||
          issue.end <= issue.start ||
          issue.end > source.length
        ) {
          return [];
        }
        const candidate = source.slice(issue.start, issue.end);
        return /^[A-Za-z_][A-Za-z0-9_]*$/.test(candidate) &&
          !existing.has(candidate)
          ? [candidate]
          : [];
      }),
    ),
  ];
}

function insertionResult(
  source: string,
  start: number,
  end: number,
  token: QuickExpressionToken,
): {
  readonly next: string;
  readonly selectionEnd: number;
  readonly selectionStart: number;
} {
  const selected = source.slice(start, end);
  if (token === "pi") {
    const next = `${source.slice(0, start)}pi${source.slice(end)}`;
    return { next, selectionEnd: start + 2, selectionStart: start + 2 };
  }
  const replacement = `${token}(${selected})`;
  const next = `${source.slice(0, start)}${replacement}${source.slice(end)}`;
  const argumentStart = start + token.length + 1;
  return {
    next,
    selectionEnd:
      selected.length === 0 ? argumentStart : argumentStart + selected.length,
    selectionStart: argumentStart,
  };
}

function ExpressionField({
  ariaLabel,
  existingParameterNames,
  field,
  initialFocus = false,
  issueId,
  issues,
  label,
  onCreateParameter,
  onSourceChange,
  parameterLimitReached,
  placeholder,
  showTools = false,
  source,
}: {
  readonly ariaLabel: string;
  readonly existingParameterNames: readonly string[];
  readonly field: string;
  readonly initialFocus?: boolean;
  readonly issueId: string;
  readonly issues: readonly CoordinatePlotEditorIssue[];
  readonly label: string;
  readonly onCreateParameter: (name: string) => void;
  readonly onSourceChange: (source: string) => void;
  readonly parameterLimitReached: boolean;
  readonly placeholder?: string;
  readonly showTools?: boolean;
  readonly source: string;
}): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const unknownNames = unknownParameterNames(
    issues,
    field,
    source,
    existingParameterNames,
  );

  const insertToken = (token: QuickExpressionToken) => {
    const input = inputRef.current;
    const start = input?.selectionStart ?? source.length;
    const end = input?.selectionEnd ?? start;
    const result = insertionResult(source, start, end, token);
    onSourceChange(result.next);
    queueMicrotask(() => {
      const current = inputRef.current;
      current?.focus();
      current?.setSelectionRange(result.selectionStart, result.selectionEnd);
    });
  };

  return (
    <div className="plot-expression-field">
      <label>
        {label}
        <input
          {...issueAttributes(issues, field, issueId, false)}
          aria-label={ariaLabel}
          data-plot-editor-initial-focus={initialFocus ? "true" : undefined}
          maxLength={2_000}
          onChange={(event) => onSourceChange(event.currentTarget.value)}
          placeholder={placeholder}
          ref={inputRef}
          spellCheck={false}
          value={source}
        />
      </label>
      {showTools ? (
        <div
          aria-label={`Быстрые вставки для поля «${label}»`}
          className="plot-expression-tools"
          role="toolbar"
        >
          {quickExpressionTokens.map((token) => (
            <button
              aria-label={`Вставить ${token}`}
              key={token}
              onClick={() => insertToken(token)}
              onMouseDown={(event) => event.preventDefault()}
              type="button"
            >
              {token === "pi" ? "π" : `${token}( )`}
            </button>
          ))}
        </div>
      ) : null}
      <IssueList
        field={field}
        id={issueId}
        includeDescendants={false}
        issues={issues}
      />
      {unknownNames.length === 0 ? null : (
        <div
          className="plot-parameter-cta"
          role="group"
          aria-label="Создание параметров из формулы"
        >
          {unknownNames.map((name) => (
            <button
              disabled={parameterLimitReached}
              key={name}
              onClick={() => onCreateParameter(name)}
              type="button"
            >
              Создать параметр «{name}»
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FormulaSyntaxHelp(): ReactElement {
  return (
    <details className="plot-expression-help">
      <summary>Краткая справка по формулам</summary>
      <div>
        <p>
          Используйте <code>+</code>, <code>-</code>, <code>*</code>,{" "}
          <code>/</code> и <code>^</code>. Пример: <code>2*x^2-3*x+1</code>.
        </p>
        <p>
          Доступны <code>sin(x)</code>, <code>cos(x)</code>,{" "}
          <code>sqrt(x)</code>, <code>abs(x)</code> и константа <code>pi</code>.
        </p>
        <p className="plot-radian-hint">
          Тригонометрические функции используют радианы: <code>pi</code>{" "}
          соответствует 180°.
        </p>
      </div>
    </details>
  );
}

function SeriesEditor({
  definition,
  issues,
  onChange,
  onCreateParameter,
  series,
}: {
  readonly definition: CoordinatePlotDefinition;
  readonly issues: readonly CoordinatePlotEditorIssue[];
  readonly onChange: (definition: CoordinatePlotDefinition) => void;
  readonly onCreateParameter: (name: string) => void;
  readonly series: PlotSeries;
}): ReactElement {
  const index = definition.series.findIndex(({ id }) => id === series.id);
  const prefix = `series.${index}`;
  const parameterNames = definition.parameters.map(({ name }) => name);
  const parameterLimitReached =
    definition.parameters.length >= maximumCoordinatePlotParameters;
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
          Тип функции
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
            <option value="explicit">Явная: y = f(x)</option>
            <option value="parametric">Параметрическая: x(t), y(t)</option>
          </select>
        </label>
      </div>

      <FormulaSyntaxHelp />

      {series.kind === "explicit" ? (
        <>
          <ExpressionField
            ariaLabel="Формула явной функции"
            existingParameterNames={parameterNames}
            field={`${prefix}.expression`}
            initialFocus
            issueId={`plot-series-${index}-expression-issues`}
            issues={issues}
            label="Формула y ="
            onCreateParameter={onCreateParameter}
            onSourceChange={(expression) => replace({ ...series, expression })}
            parameterLimitReached={parameterLimitReached}
            showTools
            source={series.expression}
          />
          <div className="plot-editor-grid two-columns">
            <ExpressionField
              ariaLabel="Начало области определения по X"
              existingParameterNames={parameterNames}
              field={`${prefix}.domain.minExpression`}
              issueId={`plot-series-${index}-domain-min-issues`}
              issues={issues}
              label="Область по X: от"
              onCreateParameter={onCreateParameter}
              onSourceChange={(value) =>
                replace({
                  ...series,
                  domain: {
                    ...series.domain,
                    minExpression: value.trim() === "" ? null : value,
                  },
                })
              }
              parameterLimitReached={parameterLimitReached}
              placeholder="автоматически"
              source={series.domain.minExpression ?? ""}
            />
            <ExpressionField
              ariaLabel="Конец области определения по X"
              existingParameterNames={parameterNames}
              field={`${prefix}.domain.maxExpression`}
              issueId={`plot-series-${index}-domain-max-issues`}
              issues={issues}
              label="Область по X: до"
              onCreateParameter={onCreateParameter}
              onSourceChange={(value) =>
                replace({
                  ...series,
                  domain: {
                    ...series.domain,
                    maxExpression: value.trim() === "" ? null : value,
                  },
                })
              }
              parameterLimitReached={parameterLimitReached}
              placeholder="автоматически"
              source={series.domain.maxExpression ?? ""}
            />
          </div>
        </>
      ) : (
        <>
          <ExpressionField
            ariaLabel="Параметрическая формула x"
            existingParameterNames={parameterNames}
            field={`${prefix}.xExpression`}
            initialFocus
            issueId={`plot-series-${index}-x-expression-issues`}
            issues={issues}
            label="Координата x(t)"
            onCreateParameter={onCreateParameter}
            onSourceChange={(xExpression) =>
              replace({ ...series, xExpression })
            }
            parameterLimitReached={parameterLimitReached}
            showTools
            source={series.xExpression}
          />
          <ExpressionField
            ariaLabel="Параметрическая формула y"
            existingParameterNames={parameterNames}
            field={`${prefix}.yExpression`}
            issueId={`plot-series-${index}-y-expression-issues`}
            issues={issues}
            label="Координата y(t)"
            onCreateParameter={onCreateParameter}
            onSourceChange={(yExpression) =>
              replace({ ...series, yExpression })
            }
            parameterLimitReached={parameterLimitReached}
            showTools
            source={series.yExpression}
          />
          <div className="plot-editor-grid two-columns">
            <ExpressionField
              ariaLabel="Начало диапазона параметра t"
              existingParameterNames={parameterNames}
              field={`${prefix}.range.minExpression`}
              issueId={`plot-series-${index}-range-min-issues`}
              issues={issues}
              label="Параметр t: от"
              onCreateParameter={onCreateParameter}
              onSourceChange={(minExpression) =>
                replace({
                  ...series,
                  range: { ...series.range, minExpression },
                })
              }
              parameterLimitReached={parameterLimitReached}
              source={series.range.minExpression}
            />
            <ExpressionField
              ariaLabel="Конец диапазона параметра t"
              existingParameterNames={parameterNames}
              field={`${prefix}.range.maxExpression`}
              issueId={`plot-series-${index}-range-max-issues`}
              issues={issues}
              label="Параметр t: до"
              onCreateParameter={onCreateParameter}
              onSourceChange={(maxExpression) =>
                replace({
                  ...series,
                  range: { ...series.range, maxExpression },
                })
              }
              parameterLimitReached={parameterLimitReached}
              source={series.range.maxExpression}
            />
          </div>
          <label className="plot-editor-check">
            <input
              checked={series.closed}
              onChange={(event) =>
                replace({ ...series, closed: event.currentTarget.checked })
              }
              type="checkbox"
            />
            Соединить начало и конец кривой
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
          Стиль линии
          <select
            aria-label="Стиль линии"
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
                {lineStyleLabels[lineStyle]}
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
  issues,
  onChange,
  parameter,
}: {
  readonly definition: CoordinatePlotDefinition;
  readonly issues: readonly CoordinatePlotEditorIssue[];
  readonly onChange: (definition: CoordinatePlotDefinition) => void;
  readonly parameter: PlotParameter;
}): ReactElement {
  const index = definition.parameters.findIndex(
    ({ id }) => id === parameter.id,
  );
  const prefix = `parameters.${index}`;
  const nameIssueId = `plot-parameter-${index}-name-issues`;
  const rangeIssueId = `plot-parameter-${index}-range-issues`;
  const stepIssueId = `plot-parameter-${index}-step-issues`;
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
            {...issueAttributes(issues, `${prefix}.name`, nameIssueId, false)}
            aria-label={`Имя параметра ${parameter.id}`}
            data-parameter-name={parameter.name}
            maxLength={32}
            onChange={(event) =>
              replace({ ...parameter, name: event.currentTarget.value })
            }
            value={parameter.name}
          />
        </label>
        <label>
          Значение
          <NumberDraftInput
            inputProps={{ "aria-label": "Значение" }}
            onCommit={(value) => {
              if (value !== null) replace({ ...parameter, value });
            }}
            value={parameter.value}
          />
        </label>
        <label>
          Минимум
          <NumberDraftInput
            inputProps={{
              ...issueAttributes(issues, prefix, rangeIssueId, false),
              "aria-label": "Минимум",
            }}
            nullable
            onCommit={(min) => replace({ ...parameter, min })}
            value={parameter.min}
          />
        </label>
        <label>
          Максимум
          <NumberDraftInput
            inputProps={{
              ...issueAttributes(issues, prefix, rangeIssueId, false),
              "aria-label": "Максимум",
            }}
            nullable
            onCommit={(max) => replace({ ...parameter, max })}
            value={parameter.max}
          />
        </label>
        <label>
          Шаг
          <NumberDraftInput
            inputProps={{
              ...issueAttributes(issues, `${prefix}.step`, stepIssueId, false),
              min: "0",
            }}
            nullable
            onCommit={(step) => replace({ ...parameter, step })}
            value={parameter.step}
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
      <IssueList
        field={`${prefix}.name`}
        id={nameIssueId}
        includeDescendants={false}
        issues={issues}
      />
      <IssueList
        field={prefix}
        id={rangeIssueId}
        includeDescendants={false}
        issues={issues}
      />
      <IssueList
        field={`${prefix}.step`}
        id={stepIssueId}
        includeDescendants={false}
        issues={issues}
      />
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

function FunctionsTab({
  definition,
  issues,
  onAddSeries,
  onChange,
  onCreateParameter,
  onSelectedSeriesChange,
  selectedSeries,
  selectedSeriesId,
}: {
  readonly definition: CoordinatePlotDefinition;
  readonly issues: readonly CoordinatePlotEditorIssue[];
  readonly onAddSeries: (kind: PlotSeries["kind"]) => void;
  readonly onChange: (definition: CoordinatePlotDefinition) => void;
  readonly onCreateParameter: (name: string) => void;
  readonly onSelectedSeriesChange: (seriesId: PlotSeriesId | null) => void;
  readonly selectedSeries: PlotSeries | null;
  readonly selectedSeriesId: PlotSeriesId | null;
}): ReactElement {
  return (
    <div className="plot-editor-tab-content">
      <div className="plot-editor-section-card">
        <div className="plot-editor-section-heading">
          <div>
            <strong>Функции и кривые</strong>
            <span>{definition.series.length} серий</span>
          </div>
          <div className="plot-editor-actions compact">
            <button
              disabled={definition.series.length >= maximumCoordinatePlotSeries}
              onClick={() => onAddSeries("explicit")}
              type="button"
            >
              + Явная функция
            </button>
            <button
              disabled={definition.series.length >= maximumCoordinatePlotSeries}
              onClick={() => onAddSeries("parametric")}
              type="button"
            >
              + Параметрическая кривая
            </button>
          </div>
        </div>
        <ol className="plot-series-list">
          {definition.series.map((series) => (
            <li
              className={series.id === selectedSeries?.id ? "is-selected" : ""}
              key={series.id}
            >
              <input
                aria-label={`Показывать ${series.name}`}
                checked={series.visible}
                onChange={(event) =>
                  onChange(
                    updateCoordinatePlotSeries(definition, {
                      ...series,
                      visible: event.currentTarget.checked,
                    }),
                  )
                }
                type="checkbox"
              />
              <button
                aria-pressed={series.id === selectedSeries?.id}
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
                  onChange(next);
                  if (selectedSeriesId === series.id) {
                    onSelectedSeriesChange(next.series[0]?.id ?? null);
                  }
                }}
                type="button"
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
      <div className="plot-editor-section-card">
        {selectedSeries === null ? (
          <p>Добавьте первую функцию или кривую.</p>
        ) : (
          <SeriesEditor
            definition={definition}
            issues={issues}
            onChange={onChange}
            onCreateParameter={onCreateParameter}
            series={selectedSeries}
          />
        )}
      </div>
    </div>
  );
}

function ParametersTab({
  definition,
  issues,
  onAddParameter,
  onChange,
}: {
  readonly definition: CoordinatePlotDefinition;
  readonly issues: readonly CoordinatePlotEditorIssue[];
  readonly onAddParameter: (name?: string) => void;
  readonly onChange: (definition: CoordinatePlotDefinition) => void;
}): ReactElement {
  return (
    <div className="plot-editor-tab-content">
      <div className="plot-editor-section-card">
        <div className="plot-editor-section-heading">
          <div>
            <strong>Общие параметры</strong>
            <span>{definition.parameters.length} параметров</span>
          </div>
          <button
            disabled={
              definition.parameters.length >= maximumCoordinatePlotParameters
            }
            onClick={() => onAddParameter()}
            type="button"
          >
            Добавить параметр
          </button>
        </div>
        <p className="plot-editor-hint">
          Параметры доступны во всех функциях. Пример: <code>y=a*x^2+b</code>.
        </p>
      </div>
      {definition.parameters.length === 0 ? (
        <div className="plot-editor-empty-state">
          <strong>Параметров пока нет</strong>
          <span>
            Введите имя в формулу и используйте кнопку создания рядом с ошибкой
            либо добавьте параметр вручную.
          </span>
        </div>
      ) : (
        definition.parameters.map((parameter) => (
          <ParameterEditor
            definition={definition}
            issues={issues}
            key={parameter.id}
            onChange={onChange}
            parameter={parameter}
          />
        ))
      )}
      <IssueList
        field="parameters"
        includeDescendants={false}
        issues={issues}
      />
    </div>
  );
}

function ViewTab({
  definition,
  issues,
  onChange,
}: {
  readonly definition: CoordinatePlotDefinition;
  readonly issues: readonly CoordinatePlotEditorIssue[];
  readonly onChange: (definition: CoordinatePlotDefinition) => void;
}): ReactElement {
  const viewportIssueId = "plot-editor-viewport-issues";
  const gridIssueId = "plot-editor-grid-issues";
  const viewportFields = [
    { ariaLabel: "Минимальная граница X", key: "xMin", label: "X: от" },
    { ariaLabel: "Максимальная граница X", key: "xMax", label: "X: до" },
    { ariaLabel: "Минимальная граница Y", key: "yMin", label: "Y: от" },
    { ariaLabel: "Максимальная граница Y", key: "yMax", label: "Y: до" },
  ] as const;

  return (
    <div className="plot-editor-tab-content">
      <div className="plot-editor-section-card">
        <div className="plot-editor-section-heading">
          <div>
            <strong>Диапазон координат</strong>
            <span>Видимая область графика</span>
          </div>
          <div className="plot-editor-actions compact">
            <button
              onClick={() => onChange(fitCoordinatePlotDefinition(definition))}
              type="button"
            >
              Вместить графики
            </button>
            <button
              onClick={() => onChange(resetCoordinatePlotViewport(definition))}
              type="button"
            >
              Стандартный диапазон
            </button>
          </div>
        </div>
        <div className="plot-editor-grid viewport-grid">
          {viewportFields.map(({ ariaLabel, key, label }) => (
            <label key={key}>
              {label}
              <NumberDraftInput
                inputProps={{
                  ...issueAttributes(
                    issues,
                    "coordinateViewport",
                    viewportIssueId,
                  ),
                  "aria-label": ariaLabel,
                }}
                onCommit={(value) => {
                  if (value !== null) {
                    onChange(updateViewport(definition, key, value));
                  }
                }}
                value={definition.coordinateViewport[key]}
              />
            </label>
          ))}
        </div>
        <label className="plot-editor-check">
          <input
            checked={definition.coordinateViewport.equalScale}
            onChange={(event) =>
              onChange({
                ...definition,
                coordinateViewport: {
                  ...definition.coordinateViewport,
                  equalScale: event.currentTarget.checked,
                },
              })
            }
            type="checkbox"
          />
          Одинаковый масштаб по X и Y
        </label>
        <p className="plot-editor-hint">
          На плоскости: перетаскивание сдвигает диапазон, колесо и жест двумя
          пальцами масштабируют. Режим XY, X или Y выбирается на панели над
          полотном; Shift и Alt временно переключают масштабирование на X или Y.
        </p>
        <IssueList
          field="coordinateViewport"
          id={viewportIssueId}
          issues={issues}
        />
      </div>

      <div className="plot-editor-section-card">
        <div className="plot-editor-section-heading">
          <div>
            <strong>Сетка и оси</strong>
            <span>Линии, подписи и шаг делений</span>
          </div>
        </div>
        <div className="plot-editor-checks">
          <label>
            <input
              checked={definition.grid.visible}
              onChange={(event) =>
                onChange({
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
                onChange({
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
                onChange({
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
                onChange({
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
                onChange({
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
                onChange({
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
                onChange({
                  ...definition,
                  axes: {
                    ...definition.axes,
                    showLabels: event.currentTarget.checked,
                  },
                })
              }
              type="checkbox"
            />
            Подписи осей
          </label>
          <label>
            <input
              checked={definition.axes.showArrows}
              onChange={(event) =>
                onChange({
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
        </div>
        {definition.grid.automaticStep ? null : (
          <div className="plot-editor-grid two-columns">
            <label>
              Шаг сетки по X
              <NumberDraftInput
                inputProps={{
                  ...issueAttributes(issues, "grid", gridIssueId),
                  min: "0.000000001",
                }}
                onCommit={(xStep) => {
                  if (xStep !== null) {
                    onChange({
                      ...definition,
                      grid: { ...definition.grid, xStep },
                    });
                  }
                }}
                value={definition.grid.xStep ?? 1}
              />
            </label>
            <label>
              Шаг сетки по Y
              <NumberDraftInput
                inputProps={{
                  ...issueAttributes(issues, "grid", gridIssueId),
                  min: "0.000000001",
                }}
                onCommit={(yStep) => {
                  if (yStep !== null) {
                    onChange({
                      ...definition,
                      grid: { ...definition.grid, yStep },
                    });
                  }
                }}
                value={definition.grid.yStep ?? 1}
              />
            </label>
          </div>
        )}
        <div className="plot-editor-grid two-columns">
          <label>
            Подпись оси X
            <input
              maxLength={24}
              onChange={(event) =>
                onChange({
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
            Подпись оси Y
            <input
              maxLength={24}
              onChange={(event) =>
                onChange({
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
        <IssueList field="grid" id={gridIssueId} issues={issues} />
      </div>

      <div className="plot-editor-section-card">
        <div className="plot-editor-section-heading">
          <div>
            <strong>Легенда</strong>
            <span>Названия и положение списка функций</span>
          </div>
        </div>
        <label className="plot-editor-check">
          <input
            checked={definition.legend.visible}
            onChange={(event) =>
              onChange({
                ...definition,
                legend: {
                  ...definition.legend,
                  visible: event.currentTarget.checked,
                },
              })
            }
            type="checkbox"
          />
          Показывать легенду
        </label>
        <label>
          Положение легенды
          <select
            aria-label="Положение легенды"
            onChange={(event) =>
              onChange({
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
                {legendPositionLabels[position]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div
        className="plot-editor-section-card"
        data-testid="renderer-status-help"
      >
        <div className="plot-editor-section-heading">
          <div>
            <strong>Статусы построения</strong>
            <span>Что означают отметки рядом с функциями</span>
          </div>
        </div>
        <ul className="plot-renderer-status-list">
          <li data-renderer-status="sampled">
            <span aria-hidden="true">✓</span>
            <div>
              <strong>Построено</strong>
              <small>Полный рассчитанный график отображён.</small>
            </div>
          </li>
          <li data-renderer-status="truncated">
            <span aria-hidden="true">…</span>
            <div>
              <strong>Лимит детализации</strong>
              <small>
                Безопасный лимит точек или вычислений остановил дальнейшее
                уточнение.
              </small>
            </div>
          </li>
          <li data-renderer-status="invalid">
            <span aria-hidden="true">⚠</span>
            <div>
              <strong>Ошибка</strong>
              <small>
                Формула, область определения или диапазон не вычисляются.
              </small>
            </div>
          </li>
          <li data-renderer-status="aborted">
            <span aria-hidden="true">×</span>
            <div>
              <strong>Отменено</strong>
              <small>
                Устаревшее построение остановлено после нового изменения.
              </small>
            </div>
          </li>
        </ul>
      </div>
    </div>
  );
}

function focusableDialogElements(root: HTMLElement): HTMLElement[] {
  return [
    ...root.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [tabindex]:not([tabindex="-1"])',
    ),
  ].filter((element) => element.closest("[hidden]") === null);
}

function trapDialogFocus(event: ReactKeyboardEvent<HTMLElement>): void {
  if (event.key !== "Tab") return;
  const elements = focusableDialogElements(event.currentTarget);
  if (elements.length === 0) return;
  const activeIndex = elements.indexOf(document.activeElement as HTMLElement);
  const nextIndex = event.shiftKey
    ? activeIndex <= 0
      ? elements.length - 1
      : activeIndex - 1
    : activeIndex === elements.length - 1
      ? 0
      : activeIndex + 1;
  event.preventDefault();
  elements[nextIndex]?.focus();
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
  const basicPanelRef = useRef<HTMLElement>(null);
  const advancedDialogRef = useRef<HTMLElement>(null);
  const advancedTriggerRef = useRef<HTMLButtonElement>(null);
  const confirmationReturnFocusRef = useRef<HTMLElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(
    typeof document !== "undefined" &&
      document.activeElement instanceof HTMLElement &&
      document.activeElement !== document.body
      ? document.activeElement
      : null,
  );
  const [activeTab, setActiveTab] =
    useState<CoordinatePlotEditorTab>("functions");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [closeConfirmationOpen, setCloseConfirmationOpen] = useState(false);
  const [pendingParameterFocus, setPendingParameterFocus] = useState<
    string | null
  >(null);
  const advancedWasOpenRef = useRef(false);
  const selectedSeries =
    definition.series.find(({ id }) => id === selectedSeriesId) ??
    definition.series[0] ??
    null;
  const basicSeries: Extract<PlotSeries, { readonly kind: "explicit" }> | null =
    selectedSeries?.kind === "explicit"
      ? selectedSeries
      : (definition.series.find(
          (
            series,
          ): series is Extract<PlotSeries, { readonly kind: "explicit" }> =>
            series.kind === "explicit",
        ) ?? null);
  const basicSeriesIndex =
    basicSeries === null
      ? -1
      : definition.series.findIndex(({ id }) => id === basicSeries.id);
  const basicParameter = definition.parameters[0] ?? null;
  const basicParameterIndex =
    basicParameter === null
      ? -1
      : definition.parameters.findIndex(({ id }) => id === basicParameter.id);
  const basicParameterSliderAvailable =
    basicParameter !== null &&
    basicParameter.min !== null &&
    basicParameter.max !== null &&
    basicParameter.step !== null &&
    basicParameter.min < basicParameter.max &&
    basicParameter.step > 0;
  const blockingIssues = issues.filter(({ blocking }) => blocking);
  const expressionIssues = issues.filter(({ blocking }) => !blocking);
  const canSave = dirty && !readOnly && blockingIssues.length === 0;
  const additionalSeries = Math.max(0, definition.series.length - 1);
  const additionalParameters = Math.max(0, definition.parameters.length - 1);

  const focusBasic = useCallback((preferred: HTMLElement | null = null) => {
    const target =
      preferred?.isConnected === true
        ? preferred
        : (basicPanelRef.current?.querySelector<HTMLElement>(
            "[data-plot-editor-initial-focus]",
          ) ?? basicPanelRef.current);
    target?.focus();
  }, []);

  const focusAdvanced = useCallback(() => {
    const target =
      advancedDialogRef.current?.querySelector<HTMLElement>(
        "[data-plot-editor-initial-focus]",
      ) ?? advancedDialogRef.current;
    target?.focus();
  }, []);

  const selectTab = useCallback(
    (tab: CoordinatePlotEditorTab, focusTab = false) => {
      setActiveTab(tab);
      if (focusTab) {
        queueMicrotask(() =>
          advancedDialogRef.current
            ?.querySelector<HTMLButtonElement>(`[data-editor-tab="${tab}"]`)
            ?.focus(),
        );
      }
    },
    [],
  );

  const handleTabKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    tab: CoordinatePlotEditorTab,
  ) => {
    const index = editorTabs.findIndex(({ id }) => id === tab);
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (index + 1) % editorTabs.length;
    if (event.key === "ArrowLeft") {
      nextIndex = (index - 1 + editorTabs.length) % editorTabs.length;
    }
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = editorTabs.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    selectTab(editorTabs[nextIndex]!.id, true);
  };

  const addParameterFromFormula = useCallback(
    (name: string, revealAdvancedParameter: boolean) => {
      if (definition.parameters.some((parameter) => parameter.name === name)) {
        if (revealAdvancedParameter) {
          setPendingParameterFocus(name);
          selectTab("parameters");
        }
        return;
      }
      if (
        definition.parameters.length >= maximumCoordinatePlotParameters ||
        !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)
      ) {
        return;
      }
      if (revealAdvancedParameter) {
        setPendingParameterFocus(name);
        selectTab("parameters");
      }
      onAddParameter(name);
    },
    [definition.parameters, onAddParameter, selectTab],
  );

  const createBasicParameterFromFormula = useCallback(
    (name: string) => addParameterFromFormula(name, false),
    [addParameterFromFormula],
  );

  const createAdvancedParameterFromFormula = useCallback(
    (name: string) => addParameterFromFormula(name, true),
    [addParameterFromFormula],
  );

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
    queueMicrotask(() => focusBasic(preferred));
  }, [focusBasic]);

  const closeAdvanced = useCallback(() => {
    setAdvancedOpen(false);
  }, []);

  useEffect(() => {
    let mounted = true;
    const original = returnFocusRef.current;
    const fallback = fallbackFocusRef?.current ?? null;
    queueMicrotask(() => {
      if (mounted) focusBasic();
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
  }, [fallbackFocusRef, focusBasic]);

  useEffect(() => {
    if (advancedOpen) {
      advancedWasOpenRef.current = true;
      queueMicrotask(focusAdvanced);
      return;
    }
    if (!advancedWasOpenRef.current) return;
    advancedWasOpenRef.current = false;
    queueMicrotask(() => advancedTriggerRef.current?.focus());
  }, [advancedOpen, focusAdvanced]);

  useEffect(() => {
    if (
      !advancedOpen ||
      activeTab !== "parameters" ||
      pendingParameterFocus === null
    ) {
      return;
    }
    const target = [
      ...(advancedDialogRef.current?.querySelectorAll<HTMLInputElement>(
        "[data-parameter-name]",
      ) ?? []),
    ].find((input) => input.dataset.parameterName === pendingParameterFocus);
    if (target === undefined) return;
    target.focus();
    target.select();
    setPendingParameterFocus(null);
  }, [activeTab, advancedOpen, definition.parameters, pendingParameterFocus]);

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
      } else if (advancedOpen) {
        closeAdvanced();
      } else {
        requestClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    advancedOpen,
    canSave,
    closeAdvanced,
    closeConfirmationOpen,
    continueEditing,
    onSave,
    requestClose,
  ]);

  return (
    <aside
      aria-describedby={advancedOpen ? undefined : `${editorId}-status`}
      aria-label="Редактор координатной плоскости"
      className="coordinate-plot-editor-panel coordinate-plot-basic-editor-panel"
      data-testid="coordinate-plot-editor"
      ref={basicPanelRef}
      tabIndex={-1}
    >
      {advancedOpen ? null : (
        <>
          <header className="plot-editor-heading plot-basic-heading">
            <div>
              <strong id={`${editorId}-title`}>Настройки графика</strong>
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

          <div className="plot-editor-basic-scroll">
            <section
              className="plot-basic-card"
              aria-labelledby={`${editorId}-formula-title`}
            >
              <div className="plot-basic-card-heading">
                <div>
                  <strong id={`${editorId}-formula-title`}>Формула</strong>
                  <span>Основной график</span>
                </div>
                {basicSeries === null ? null : (
                  <span className="plot-basic-series-name">
                    {basicSeries.name || "Без названия"}
                  </span>
                )}
              </div>
              {basicSeries === null ? (
                <div className="plot-editor-empty-state plot-basic-empty-state">
                  <strong>Используется сложный тип кривой</strong>
                  <span>
                    Параметрические кривые и наборы без явной функции доступны в
                    расширенных настройках.
                  </span>
                </div>
              ) : (
                <>
                  <ExpressionField
                    ariaLabel="Формула явной функции"
                    existingParameterNames={definition.parameters.map(
                      ({ name }) => name,
                    )}
                    field={`series.${basicSeriesIndex}.expression`}
                    initialFocus
                    issueId={`${editorId}-basic-formula-issues`}
                    issues={issues}
                    label="f(x) ="
                    onCreateParameter={createBasicParameterFromFormula}
                    onSourceChange={(expression) =>
                      onDefinitionChange(
                        updateCoordinatePlotSeries(definition, {
                          ...basicSeries,
                          expression,
                        }),
                      )
                    }
                    parameterLimitReached={
                      definition.parameters.length >=
                      maximumCoordinatePlotParameters
                    }
                    source={basicSeries.expression}
                  />
                  <p className="plot-editor-hint plot-basic-example">
                    Пример: <code>2*x+a</code>
                  </p>
                </>
              )}
            </section>

            <section
              className="plot-basic-card"
              aria-labelledby={`${editorId}-parameter-title`}
            >
              <div className="plot-basic-card-heading">
                <div>
                  <strong id={`${editorId}-parameter-title`}>Параметр</strong>
                  <span>Быстрое управление графиком</span>
                </div>
                {basicParameter === null ? null : (
                  <output
                    className="plot-basic-parameter-value"
                    htmlFor={`${editorId}-basic-parameter-slider`}
                  >
                    {basicParameter.name} = {basicParameter.value}
                  </output>
                )}
              </div>
              {basicParameter === null ? (
                <div className="plot-basic-add-parameter">
                  <p className="plot-editor-hint">
                    Добавьте параметр <code>a</code> и используйте его в
                    формуле.
                  </p>
                  <button
                    disabled={
                      definition.parameters.length >=
                      maximumCoordinatePlotParameters
                    }
                    onClick={() => onAddParameter("a")}
                    type="button"
                  >
                    Добавить параметр a
                  </button>
                </div>
              ) : basicParameterSliderAvailable ? (
                <div className="plot-basic-slider-block">
                  <div className="plot-basic-slider-row">
                    <span>{basicParameter.min}</span>
                    <input
                      aria-label={`Ползунок параметра ${basicParameter.name}`}
                      id={`${editorId}-basic-parameter-slider`}
                      max={basicParameter.max ?? undefined}
                      min={basicParameter.min ?? undefined}
                      onChange={(event) =>
                        onDefinitionChange(
                          updateCoordinatePlotParameter(definition, {
                            ...basicParameter,
                            value: numberValue(
                              event.currentTarget.value,
                              basicParameter.value,
                            ),
                          }),
                        )
                      }
                      step={basicParameter.step ?? undefined}
                      type="range"
                      value={Math.max(
                        basicParameter.min ?? basicParameter.value,
                        Math.min(
                          basicParameter.max ?? basicParameter.value,
                          basicParameter.value,
                        ),
                      )}
                    />
                    <span>{basicParameter.max}</span>
                  </div>
                  <IssueList
                    field={`parameters.${basicParameterIndex}`}
                    issues={issues}
                  />
                </div>
              ) : (
                <div className="plot-editor-warning">
                  Для параметра требуется корректный минимум, максимум и шаг.
                  Точные значения доступны в расширенных настройках.
                </div>
              )}
            </section>

            {additionalSeries === 0 && additionalParameters === 0 ? null : (
              <p className="plot-basic-complexity-summary">
                Дополнительно: {additionalSeries} серий и {additionalParameters}{" "}
                параметров. Полный список доступен в расширенных настройках.
              </p>
            )}

            {blockingIssues.length === 0 ? null : (
              <div className="plot-editor-error" role="alert">
                Исправьте структурные ошибки перед сохранением.
                <IssueList field="" issues={blockingIssues} />
              </div>
            )}

            <button
              className="plot-basic-advanced-action"
              onClick={() => setAdvancedOpen(true)}
              ref={advancedTriggerRef}
              type="button"
            >
              <span>
                <strong>Расширенные настройки</strong>
                <small>Серии, параметры, оси, сетка, диапазоны и стили</small>
              </span>
              <span aria-hidden="true">→</span>
            </button>
          </div>

          <footer className="plot-editor-footer plot-basic-footer">
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
        </>
      )}

      {advancedOpen ? (
        <div className="plot-editor-advanced-backdrop">
          <section
            aria-describedby={`${editorId}-advanced-status`}
            aria-label="Расширенные настройки графика"
            aria-modal="true"
            className="coordinate-plot-editor-panel coordinate-plot-advanced-dialog"
            data-testid="coordinate-plot-advanced-editor"
            onKeyDown={trapDialogFocus}
            ref={advancedDialogRef}
            role="dialog"
            tabIndex={-1}
          >
            <header className="plot-editor-heading">
              <div>
                <strong>Расширенные настройки графика</strong>
                <span aria-live="polite" id={`${editorId}-advanced-status`}>
                  {dirty
                    ? "Черновик содержит изменения"
                    : "Изменения сохранены"}
                </span>
              </div>
              <button
                aria-label="Вернуться к базовым настройкам"
                onClick={closeAdvanced}
                type="button"
              >
                <span aria-hidden="true">×</span>
              </button>
            </header>

            <div
              aria-label="Разделы расширенного редактора графика"
              className="plot-editor-tabs"
              role="tablist"
            >
              {editorTabs.map((tab) => (
                <button
                  aria-controls={`${editorId}-panel-${tab.id}`}
                  aria-selected={activeTab === tab.id}
                  data-editor-tab={tab.id}
                  id={`${editorId}-tab-${tab.id}`}
                  key={tab.id}
                  onClick={() => selectTab(tab.id)}
                  onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
                  role="tab"
                  tabIndex={activeTab === tab.id ? 0 : -1}
                  type="button"
                >
                  {tab.label}
                  {tab.id === "parameters"
                    ? ` (${definition.parameters.length})`
                    : ""}
                </button>
              ))}
            </div>

            <div className="plot-editor-scroll">
              <section
                aria-labelledby={`${editorId}-tab-functions`}
                hidden={activeTab !== "functions"}
                id={`${editorId}-panel-functions`}
                role="tabpanel"
              >
                <FunctionsTab
                  definition={definition}
                  issues={issues}
                  onAddSeries={onAddSeries}
                  onChange={onDefinitionChange}
                  onCreateParameter={createAdvancedParameterFromFormula}
                  onSelectedSeriesChange={onSelectedSeriesChange}
                  selectedSeries={selectedSeries}
                  selectedSeriesId={selectedSeriesId}
                />
              </section>
              <section
                aria-labelledby={`${editorId}-tab-parameters`}
                hidden={activeTab !== "parameters"}
                id={`${editorId}-panel-parameters`}
                role="tabpanel"
              >
                <ParametersTab
                  definition={definition}
                  issues={issues}
                  onAddParameter={onAddParameter}
                  onChange={onDefinitionChange}
                />
              </section>
              <section
                aria-labelledby={`${editorId}-tab-view`}
                hidden={activeTab !== "view"}
                id={`${editorId}-panel-view`}
                role="tabpanel"
              >
                <ViewTab
                  definition={definition}
                  issues={issues}
                  onChange={onDefinitionChange}
                />
              </section>

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
              <button onClick={closeAdvanced} type="button">
                К базовым настройкам
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
          </section>
        </div>
      ) : null}

      {closeConfirmationOpen ? (
        <div className="plot-editor-confirmation-backdrop">
          <section
            aria-describedby={`${editorId}-close-description`}
            aria-labelledby={`${editorId}-close-title`}
            aria-modal="true"
            className="plot-editor-confirmation"
            onKeyDown={trapDialogFocus}
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
