from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected one {label} anchor, found {count}")
    return text.replace(old, new, 1)


model_path = Path("src/modules/coordinate-plot-editor/model.ts")
model = model_path.read_text(encoding="utf-8")
model = replace_once(
    model,
    '  const size = { height: 420, width: 640 } as const;\n  return {',
    '  const size = { height: 420, width: 640 } as const;\n'
    '  const defaultSeries = createExplicitPlotSeries(input.ids.seriesId(), 0);\n'
    '  return {',
    "default series declaration",
)
model = replace_once(
    model,
    '      parameters: [],\n      series: [createExplicitPlotSeries(input.ids.seriesId(), 0)],',
    '      parameters: [\n'
    '        {\n'
    '          id: input.ids.parameterId(),\n'
    '          max: 10,\n'
    '          min: -10,\n'
    '          name: "a",\n'
    '          step: 0.1,\n'
    '          value: 1,\n'
    '        },\n'
    '      ],\n'
    '      series: [{ ...defaultSeries, expression: "2*x+a" }],',
    "default formula and parameter",
)
model_path.write_text(model, encoding="utf-8")

panel_path = Path("src/app/CoordinatePlotEditorPanel.tsx")
panel = panel_path.read_text(encoding="utf-8")
marker = "export function CoordinatePlotEditorPanel({"
start = panel.find(marker)
if start < 0:
    raise RuntimeError("CoordinatePlotEditorPanel export anchor is missing")
replacement = r'''function focusableDialogElements(root: HTMLElement): HTMLElement[] {
  return [
    ...root.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [tabindex]:not([tabindex="-1"])',
    ),
  ].filter((element) => !element.hasAttribute("hidden"));
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
  const basicSeries =
    selectedSeries?.kind === "explicit"
      ? selectedSeries
      : (definition.series.find(({ kind }) => kind === "explicit") ?? null);
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
            "[data-plot-basic-initial-focus]",
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
  }, [
    activeTab,
    advancedOpen,
    definition.parameters,
    pendingParameterFocus,
  ]);

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
      aria-describedby={`${editorId}-status`}
      aria-label="Редактор координатной плоскости"
      className="coordinate-plot-editor-panel coordinate-plot-basic-editor-panel"
      data-testid="coordinate-plot-editor"
      ref={basicPanelRef}
      tabIndex={-1}
    >
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
        <section className="plot-basic-card" aria-labelledby={`${editorId}-formula-title`}>
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
                  definition.parameters.length >= maximumCoordinatePlotParameters
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
                Добавьте параметр <code>a</code> и используйте его в формуле.
              </p>
              <button
                disabled={
                  definition.parameters.length >= maximumCoordinatePlotParameters
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
'''
panel_path.write_text(panel[:start] + replacement, encoding="utf-8")

css_path = Path("src/app/CoordinatePlotEditorPanel.css")
css = css_path.read_text(encoding="utf-8")
css += r'''

/* Two-level coordinate-plot editor */
.coordinate-plot-basic-editor-panel {
  width: min(390px, calc(100% - 32px));
}

.plot-editor-basic-scroll {
  display: grid;
  gap: 10px;
  overflow: auto;
  padding: 12px;
}

.plot-basic-card {
  display: grid;
  gap: 10px;
  padding: 14px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  border-radius: 13px;
  background: #fff;
}

.plot-basic-card-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.plot-basic-card-heading > div:first-child {
  display: grid;
  gap: 2px;
}

.plot-basic-card-heading span,
.plot-basic-series-name {
  color: #64748b;
  font-size: 12px;
}

.plot-basic-series-name {
  overflow: hidden;
  max-width: 45%;
  padding: 3px 7px;
  border-radius: 999px;
  background: #f1f5f9;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.plot-basic-example {
  margin-top: -2px;
}

.plot-basic-parameter-value {
  padding: 4px 8px;
  border-radius: 8px;
  background: #dbeafe;
  color: #1d4ed8;
  font-variant-numeric: tabular-nums;
  font-weight: 800;
}

.plot-basic-slider-block,
.plot-basic-add-parameter {
  display: grid;
  gap: 9px;
}

.plot-basic-slider-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  color: #64748b;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.plot-basic-slider-row input[type="range"] {
  width: 100%;
  accent-color: #2563eb;
}

.plot-basic-complexity-summary {
  margin: 0;
  padding: 9px 11px;
  border-radius: 10px;
  background: #f8fafc;
  color: #64748b;
  font-size: 12px;
  line-height: 1.45;
}

.plot-basic-advanced-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 10px 12px !important;
  border-color: rgba(37, 99, 235, 0.28) !important;
  background: #eff6ff !important;
  color: #1e3a8a !important;
  text-align: left;
}

.plot-basic-advanced-action > span:first-child {
  display: grid;
  gap: 2px;
}

.plot-basic-advanced-action small {
  color: #64748b;
  font-size: 11px;
  font-weight: 500;
}

.plot-basic-advanced-action > span:last-child {
  font-size: 20px;
}

.plot-editor-advanced-backdrop {
  position: fixed;
  z-index: 90;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 22px;
  background: rgba(15, 23, 42, 0.5);
  backdrop-filter: blur(4px);
}

.coordinate-plot-advanced-dialog {
  position: relative;
  z-index: 1;
  inset: auto;
  width: min(860px, calc(100vw - 44px));
  max-height: calc(100dvh - 44px);
  margin: 0;
}

.coordinate-plot-advanced-dialog .plot-editor-scroll {
  min-height: 0;
  flex: 1 1 auto;
}

@media (max-width: 900px) {
  .coordinate-plot-basic-editor-panel {
    width: auto;
  }

  .coordinate-plot-advanced-dialog {
    position: relative;
    top: auto;
    right: auto;
    bottom: auto;
    left: auto;
    width: min(760px, calc(100vw - 24px));
    max-height: calc(100dvh - 24px);
  }
}

@media (max-width: 640px), (max-width: 900px) and (max-height: 520px) {
  .plot-editor-advanced-backdrop {
    padding: 0;
  }

  .coordinate-plot-advanced-dialog {
    position: fixed;
    z-index: 100;
    inset: 0;
    width: 100vw;
    height: 100dvh;
    max-height: none;
    padding-top: env(safe-area-inset-top);
    padding-right: env(safe-area-inset-right);
    padding-bottom: env(safe-area-inset-bottom);
    padding-left: env(safe-area-inset-left);
    border: 0;
    border-radius: 0;
  }

  .plot-basic-card-heading {
    align-items: stretch;
  }
}
'''
css_path.write_text(css, encoding="utf-8")

workflow_test_path = Path("src/app/CoordinatePlotEditorWorkflow.test.tsx")
workflow_test = workflow_test_path.read_text(encoding="utf-8")
workflow_test = replace_once(
    workflow_test,
    '        expression: "x^2",',
    '        expression: "2*x+a",',
    "workflow default expression",
)
workflow_test_path.write_text(workflow_test, encoding="utf-8")

panel_test_path = Path("src/app/CoordinatePlotEditorPanel.test.tsx")
panel_test = panel_test_path.read_text(encoding="utf-8")
panel_test = replace_once(
    panel_test,
    'describe("CoordinatePlotEditorPanel", () => {\n',
    '''describe("CoordinatePlotEditorPanel", () => {\n  it("shows a compact formula and primary parameter before advanced settings", () => {\n    render(<PanelHarness />);\n\n    expect(screen.getByLabelText("Формула явной функции")).toHaveValue(\n      "2*x+a",\n    );\n    expect(screen.getByLabelText("Ползунок параметра a")).toBeInTheDocument();\n    expect(\n      screen.queryByRole("dialog", { name: "Расширенные настройки графика" }),\n    ).not.toBeInTheDocument();\n\n    fireEvent.click(\n      screen.getByRole("button", { name: /Расширенные настройки/ }),\n    );\n    expect(\n      screen.getByRole("dialog", { name: "Расширенные настройки графика" }),\n    ).toBeInTheDocument();\n  });\n\n''',
    "basic editor component test",
)
panel_test = replace_once(
    panel_test,
    '    fireEvent.click(screen.getByRole("button", { name: "+ Явная функция" }));',
    '    fireEvent.click(\n      screen.getByRole("button", { name: /Расширенные настройки/ }),\n    );\n    fireEvent.click(screen.getByRole("button", { name: "+ Явная функция" }));',
    "advanced routing entry",
)
panel_test = panel_test.replace(
    'screen.getByRole("tab", { name: "Параметры (0)" })',
    'screen.getByRole("tab", { name: "Параметры (1)" })',
)
panel_test = replace_once(
    panel_test,
    '    const functions = screen.getByRole("tab", { name: "Функции" });',
    '    fireEvent.click(\n      screen.getByRole("button", { name: /Расширенные настройки/ }),\n    );\n\n    const functions = screen.getByRole("tab", { name: "Функции" });',
    "tab accessibility advanced entry",
)
panel_test = replace_once(
    panel_test,
    '    fireEvent.click(screen.getByRole("tab", { name: "Вид" }));\n    const minimumX',
    '    fireEvent.click(\n      screen.getByRole("button", { name: /Расширенные настройки/ }),\n    );\n    fireEvent.click(screen.getByRole("tab", { name: "Вид" }));\n    const minimumX',
    "numeric field advanced entry",
)
panel_test = replace_once(
    panel_test,
    '    const formula = inputByLabel("Формула явной функции");\n    fireEvent.change(formula, { target: { value: "x+1" } });',
    '    fireEvent.click(\n      screen.getByRole("button", { name: /Расширенные настройки/ }),\n    );\n    const formula = inputByLabel("Формула явной функции");\n    fireEvent.change(formula, { target: { value: "x+1" } });',
    "quick tools advanced entry",
)
panel_test = replace_once(
    panel_test,
    '    await waitFor(() =>\n      expect(screen.getByLabelText("Формула явной функции")).toHaveFocus(),\n    );',
    '    fireEvent.click(\n      screen.getByRole("button", { name: /Расширенные настройки/ }),\n    );\n    await waitFor(() =>\n      expect(screen.getByLabelText("Формула явной функции")).toHaveFocus(),\n    );',
    "unknown parameter advanced entry",
)
panel_test = panel_test.replace(
    'screen.getByRole("tab", { name: "Параметры (1)" });\n    expect(parameters)',
    'screen.getByRole("tab", { name: "Параметры (2)" });\n    expect(parameters)',
    1,
)
panel_test = panel_test.replace(
    '"Имя параметра harness-parameter-0",',
    '"Имя параметра harness-parameter-1",',
)
panel_test_path.write_text(panel_test, encoding="utf-8")

model_test_path = Path("tests/unit/modules/coordinate-plot-editor/model.test.ts")
model_test = model_test_path.read_text(encoding="utf-8")
model_test = replace_once(
    model_test,
    '      expression: "x^2",',
    '      expression: "2*x+a",',
    "model default formula assertion",
)
model_test = replace_once(
    model_test,
    '    expect(plot.position).toEqual({ x: 80, y: 90 });',
    '    expect(plot.definition.parameters[0]).toMatchObject({\n      name: "a",\n      value: 1,\n      min: -10,\n      max: 10,\n      step: 0.1,\n    });\n    expect(plot.position).toEqual({ x: 80, y: 90 });',
    "model default parameter assertion",
)
model_test = replace_once(
    model_test,
    '      plotParameterId("parameter-a"),\n    );\n\n    expect(withParameter.series[1])',
    '      plotParameterId("parameter-b"),\n      "b",\n    );\n\n    expect(withParameter.series[1])',
    "model added parameter request",
)
model_test = replace_once(
    model_test,
    '    expect(withParameter.parameters[0]).toMatchObject({\n      id: "parameter-a",\n      name: "a",',
    '    expect(withParameter.parameters[1]).toMatchObject({\n      id: "parameter-b",\n      name: "b",',
    "model added parameter assertion",
)
model_test = replace_once(
    model_test,
    '    expect(definition.parameters[0]).toMatchObject({',
    '    expect(definition.parameters[1]).toMatchObject({',
    "model requested parameter index",
)
model_test = replace_once(
    model_test,
    '    const withA = addCoordinatePlotParameter(\n      plot.definition,\n      plotParameterId("parameter-a"),\n      "a",\n    );\n    const duplicate = addCoordinatePlotParameter(\n      withA,',
    '    const duplicate = addCoordinatePlotParameter(\n      plot.definition,',
    "model duplicate setup",
)
model_test = replace_once(
    model_test,
    '    expect(duplicate.parameters[1]?.name).toBe("b");\n    expect(invalid.parameters[2]?.name).toBe("c");',
    '    expect(duplicate.parameters[1]?.name).toBe("b");\n    expect(invalid.parameters[2]?.name).toBe("c");',
    "model duplicate assertions",
)
model_test_path.write_text(model_test, encoding="utf-8")

print("Applied coordinate plot basic editor patch")
