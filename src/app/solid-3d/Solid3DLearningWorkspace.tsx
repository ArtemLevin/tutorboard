import { useMemo, useState, type ReactElement } from "react";
import {
  analyzeSolidLearningAttempt,
  buildSectionConstructionGraph,
  compareSolidSectionPrediction,
  checkpointFromSample,
  createSolidTopology,
  exactValuesEqual,
  exportLearningAnalyticsCsv,
  exportLearningAnalyticsJson,
  hintForDiagnostic,
  moveAnchoredPoint,
  parseExactValue,
  scenariosForSolidKind,
  sampleDynamicSection,
  solidLearningScenarios,
  solidProofRules,
  validateConstructionAction,
  validateReasoningStep,
  type Solid3DLearningAttempt,
  type Solid3DLearningScenario,
  type SolidElementRef,
  type SolidLearningAttemptAction,
  type SolidLearningMode,
  type SolidSectionPrediction,
  type SolidSectionResult,
  type Solid3DRecord,
} from "../../core/public";
import { SolidProjectionSvg } from "./SolidProjectionSvg";

export interface Solid3DLearningWorkspaceProps {
  readonly attempt: Solid3DLearningAttempt | null;
  readonly highlighted: SolidElementRef | null;
  readonly onAction: (action: SolidLearningAttemptAction) => void;
  readonly onComplete: () => void;
  readonly onHighlight: (element: SolidElementRef | null) => void;
  readonly onReset: () => void;
  readonly onStart: (
    scenario: Solid3DLearningScenario,
    mode: SolidLearningMode,
  ) => void;
  readonly readOnly: boolean;
  readonly record: Solid3DRecord;
  readonly section: SolidSectionResult | null;
  readonly learningAttempts: readonly Solid3DLearningAttempt[];
  readonly onRecordChange: (record: Solid3DRecord) => void;
}

function actionId(): string {
  return `learning:${crypto.randomUUID()}`;
}

function Catalog({
  record,
  onStart,
  readOnly,
}: Pick<
  Solid3DLearningWorkspaceProps,
  "record" | "onStart" | "readOnly"
>): ReactElement {
  const [difficulty, setDifficulty] = useState("all");
  const [mode, setMode] = useState<SolidLearningMode>("guided");
  const scenarios = scenariosForSolidKind(record.definition.kind).filter(
    (scenario) => difficulty === "all" || scenario.difficulty === difficulty,
  );
  return (
    <section
      className="solid-learning-catalog"
      aria-labelledby="solid-learning-catalog-title"
    >
      <h3 id="solid-learning-catalog-title">Учебные сценарии</h3>
      <div className="solid-learning-filters">
        <label>
          Режим
          <select
            disabled={readOnly}
            onChange={(event) =>
              setMode(event.currentTarget.value as SolidLearningMode)
            }
            value={mode}
          >
            <option value="guided">С подсказками</option>
            <option value="assessment">Самостоятельная проверка</option>
            <option value="teacher-demo">Демонстрация учителя</option>
          </select>
        </label>
        <label>
          Сложность
          <select
            onChange={(event) => setDifficulty(event.currentTarget.value)}
            value={difficulty}
          >
            <option value="all">Все</option>
            <option value="basic">Базовая</option>
            <option value="intermediate">Средняя</option>
            <option value="advanced">Повышенная</option>
          </select>
        </label>
      </div>
      {scenarios.length === 0 ? (
        <p>Для этого тела сценарий пока доступен в свободном исследовании.</p>
      ) : null}
      <div className="solid-learning-cards">
        {scenarios.map((scenario) => (
          <article key={scenario.id}>
            <span>
              {scenario.expectedMinutes} мин · {scenario.difficulty}
            </span>
            <h4>{scenario.title}</h4>
            <p>{scenario.goal}</p>
            <button
              disabled={readOnly}
              onClick={() => onStart(scenario, mode)}
              type="button"
            >
              Начать
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function PredictionPhase({
  onAction,
  record,
  section,
}: Pick<
  Solid3DLearningWorkspaceProps,
  "onAction" | "record" | "section"
>): ReactElement {
  const topology = createSolidTopology(record.definition);
  const [vertexCount, setVertexCount] = useState(4);
  const [polygonKind, setPolygonKind] = useState("четырёхугольник");
  const [confidence, setConfidence] =
    useState<SolidSectionPrediction["confidence"]>("unsure");
  const [edges, setEdges] = useState<readonly string[]>([]);
  if (section === null)
    return (
      <p className="solid-learning-callout">
        Поставьте или выберите три точки на модели. Контур появится после
        отправки прогноза.
      </p>
    );
  return (
    <form
      className="solid-learning-form"
      onSubmit={(event) => {
        event.preventDefault();
        const draft: SolidSectionPrediction = {
          confidence,
          edgeIds: edges,
          parallelSidePairs: [],
          polygonKind,
          score: null,
          submitted: true,
          vertexCount,
        };
        const comparison = compareSolidSectionPrediction(
          draft,
          topology,
          section,
        );
        onAction({
          kind: "submit-prediction",
          prediction: { ...draft, score: comparison.score },
        });
      }}
    >
      <h3>Сначала предположите</h3>
      <label>
        Количество вершин
        <input
          min="3"
          max="12"
          onChange={(event) =>
            setVertexCount(event.currentTarget.valueAsNumber)
          }
          type="number"
          value={vertexCount}
        />
      </label>
      <label>
        Вид многоугольника
        <input
          onChange={(event) => setPolygonKind(event.currentTarget.value)}
          value={polygonKind}
        />
      </label>
      {topology === null ? null : (
        <fieldset>
          <legend>Пересекаемые рёбра</legend>
          <div className="solid-learning-edge-choices">
            {topology.edges.map((edge) => (
              <label key={edge.id}>
                <input
                  checked={edges.includes(edge.id)}
                  onChange={(event) =>
                    setEdges((current) =>
                      event.currentTarget.checked
                        ? [...current, edge.id]
                        : current.filter((id) => id !== edge.id),
                    )
                  }
                  type="checkbox"
                />
                {edge.id}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <label>
        Уверенность
        <select
          onChange={(event) =>
            setConfidence(event.currentTarget.value as typeof confidence)
          }
          value={confidence}
        >
          <option value="confident">Уверен</option>
          <option value="unsure">Сомневаюсь</option>
          <option value="stuck">Пока затрудняюсь</option>
        </select>
      </label>
      <button type="submit">Проверить прогноз</button>
    </form>
  );
}

function ConstructionPhase(
  props: Pick<
    Solid3DLearningWorkspaceProps,
    | "attempt"
    | "highlighted"
    | "onAction"
    | "onHighlight"
    | "onRecordChange"
    | "record"
    | "section"
  > & { attempt: Solid3DLearningAttempt },
): ReactElement {
  const topology = createSolidTopology(props.record.definition);
  const [showHidden, setShowHidden] = useState(true);
  const [candidateFace, setCandidateFace] = useState(
    topology?.faces[0]?.id ?? "face:0",
  );
  const graph = useMemo(
    () =>
      topology === null || props.section === null
        ? null
        : buildSectionConstructionGraph(topology, props.section),
    [props.section, topology],
  );
  const lastDiagnostic =
    [...props.attempt.diagnostics].at(-1)?.code ?? "missed-edge-intersection";
  const submit = (action: Parameters<typeof validateConstructionAction>[1]) => {
    if (graph === null) return;
    const validation = validateConstructionAction(graph, action);
    const timestamp = new Date().toISOString();
    props.onAction({
      kind: "construction-step",
      entry: {
        accepted: validation.accepted,
        action,
        diagnosticCode: validation.diagnosticCode,
        explanation: validation.explanation,
        id: actionId(),
        timestamp,
      },
    });
    if (validation.diagnosticCode !== null)
      props.onAction({
        kind: "add-diagnostic",
        diagnostic: {
          code: validation.diagnosticCode,
          element:
            action.kind === "select-face"
              ? { id: action.faceId, kind: "face" }
              : null,
          id: actionId(),
          message: validation.explanation,
          timestamp,
        },
      });
  };
  if (topology === null || graph === null)
    return (
      <p>
        Пошаговый мастер граней доступен для многогранников. Для тела вращения
        используйте исследовательский режим.
      </p>
    );
  return (
    <section className="solid-learning-construction">
      <div className="solid-learning-heading">
        <div>
          <h3>Постройте сечение по граням</h3>
          <p>
            Принятых шагов:{" "}
            {
              props.attempt.construction.trace.filter(
                ({ accepted }) => accepted,
              ).length
            }
          </p>
        </div>
        <label>
          <input
            checked={showHidden}
            onChange={(event) => setShowHidden(event.currentTarget.checked)}
            type="checkbox"
          />
          Скрытые рёбра
        </label>
      </div>
      <div className="solid-learning-projections">
        {(["isometric", "front", "top", "side"] as const).map((preset) => (
          <SolidProjectionSvg
            highlighted={props.highlighted}
            key={preset}
            onHighlight={props.onHighlight}
            preset={preset}
            section={props.attempt.prediction?.submitted ? props.section : null}
            showHiddenEdges={showHidden}
            topology={topology}
          />
        ))}
      </div>
      {props.attempt.scenarioId === "cube-dynamic-section" ? (
        <DynamicResearch
          attempt={props.attempt}
          onAction={props.onAction}
          onRecordChange={props.onRecordChange}
          record={props.record}
        />
      ) : null}
      <div className="solid-learning-builder">
        <label>
          Проверить грань
          <select
            onChange={(event) => setCandidateFace(event.currentTarget.value)}
            value={candidateFace}
          >
            {topology.faces.map((face) => (
              <option key={face.id}>{face.id}</option>
            ))}
          </select>
        </label>
        <button
          onClick={() => submit({ faceId: candidateFace, kind: "select-face" })}
          type="button"
        >
          Выбрать грань
        </button>
        {graph.segments.map((segment) => (
          <button
            key={segment.id}
            onClick={() =>
              submit({
                faceId: segment.faceId,
                fromPointId: segment.fromPointId,
                kind: "add-trace-segment",
                toPointId: segment.toPointId,
              })
            }
            type="button"
          >
            Провести {segment.fromPointId}—{segment.toPointId} на{" "}
            {segment.faceId}
          </button>
        ))}
        <button
          onClick={() =>
            submit({ kind: "close-contour", orderedPointIds: graph.cycle })
          }
          type="button"
        >
          Замкнуть контур
        </button>
      </div>
      {props.attempt.construction.trace.at(-1) === undefined ? null : (
        <p
          aria-live="polite"
          className={
            props.attempt.construction.trace.at(-1)!.accepted
              ? "solid-learning-success"
              : "solid-3d-error"
          }
        >
          {props.attempt.construction.trace.at(-1)!.explanation}
        </p>
      )}
      {props.attempt.mode === "assessment" ? null : (
        <div className="solid-learning-hints">
          <strong>Подсказки</strong>
          {([1, 2, 3] as const).map((level) => (
            <button
              key={level}
              onClick={() =>
                props.onAction({
                  kind: "use-hint",
                  hint: {
                    id: actionId(),
                    ladderId: lastDiagnostic,
                    level,
                    relatedElement: null,
                    timestamp: new Date().toISOString(),
                  },
                })
              }
              title={hintForDiagnostic(lastDiagnostic, level, graph)}
              type="button"
            >
              Уровень {level}
            </button>
          ))}
          {props.attempt.hints.at(-1) === undefined ? null : (
            <p>
              {hintForDiagnostic(
                lastDiagnostic,
                props.attempt.hints.at(-1)!.level,
                graph,
              )}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function DynamicResearch({
  attempt,
  onAction,
  onRecordChange,
  record,
}: {
  readonly attempt: Solid3DLearningAttempt;
  readonly onAction: (action: SolidLearningAttemptAction) => void;
  readonly onRecordChange: (record: Solid3DRecord) => void;
  readonly record: Solid3DRecord;
}): ReactElement | null {
  const movable = record.points.find(({ anchor }) => anchor.kind === "edge");
  const tuple = useMemo(() => {
    const pointIds = record.points.slice(0, 3).map(({ id }) => id);
    return pointIds.length === 3
      ? ([pointIds[0]!, pointIds[1]!, pointIds[2]!] as const)
      : null;
  }, [record.points]);
  const [parameter, setParameter] = useState(
    movable?.anchor.kind === "edge" ? movable.anchor.parameter : 0.5,
  );
  const samples = useMemo(
    () =>
      movable === undefined || tuple === null
        ? []
        : sampleDynamicSection(record, movable.id, tuple),
    [movable, record, tuple],
  );
  if (movable === undefined || tuple === null || samples.length === 0)
    return null;
  const current = samples.reduce((best, sample) =>
    Math.abs(sample.parameter - parameter) <
    Math.abs(best.parameter - parameter)
      ? sample
      : best,
  );
  const maxArea = Math.max(1, ...samples.map(({ area }) => area));
  const commit = () => {
    onRecordChange(moveAnchoredPoint(record, movable.id, parameter));
    onAction({
      checkpoint: checkpointFromSample(current, new Date().toISOString()),
      kind: "add-checkpoint",
    });
  };
  return (
    <section className="solid-learning-dynamic">
      <h4>Динамическое исследование</h4>
      <label>
        Положение точки на ребре: {parameter.toFixed(2)}
        <input
          max="1"
          min="0"
          onChange={(event) => setParameter(event.currentTarget.valueAsNumber)}
          onKeyUp={(event) => {
            if (event.key === "Enter") commit();
          }}
          onPointerUp={commit}
          step="0.01"
          type="range"
          value={parameter}
        />
      </label>
      <svg aria-label="График площади сечения" role="img" viewBox="0 0 400 120">
        <polyline
          points={samples
            .map(
              (sample) =>
                `${String(sample.parameter * 400)},${String(110 - (sample.area / maxArea) * 100)}`,
            )
            .join(" ")}
        />
        {samples
          .filter(({ critical }) => critical)
          .map((sample) => (
            <circle
              cx={sample.parameter * 400}
              cy={110 - (sample.area / maxArea) * 100}
              key={sample.parameter}
              r="4"
            />
          ))}
      </svg>
      <p>
        Площадь {current.area.toFixed(2)} · периметр{" "}
        {current.perimeter.toFixed(2)}· вершин {current.vertexCount}.
        Контрольных положений: {attempt.checkpoints.length}.
      </p>
    </section>
  );
}

function ReasoningPhase({
  attempt,
  onAction,
}: {
  readonly attempt: Solid3DLearningAttempt;
  readonly onAction: (action: SolidLearningAttemptAction) => void;
}): ReactElement {
  const [ruleId, setRuleId] = useState(solidProofRules[0]!.id);
  const established = new Set(["seed:point-1", "seed:point-2"]);
  return (
    <section className="solid-learning-form">
      <h3>Обоснуйте построение</h3>
      <label>
        Правило
        <select
          onChange={(event) => setRuleId(event.currentTarget.value)}
          value={ruleId}
        >
          {solidProofRules.map((rule) => (
            <option key={rule.id} value={rule.id}>
              {rule.title}
            </option>
          ))}
        </select>
      </label>
      <button
        onClick={() => {
          const draft = {
            accepted: false,
            premiseIds: [...established],
            ruleId,
            statementId: actionId(),
          };
          const checked = validateReasoningStep(draft, established);
          onAction({
            kind: "add-reasoning",
            step: { ...draft, accepted: checked.accepted },
          });
        }}
        type="button"
      >
        Добавить обоснование
      </button>
      <ol>
        {attempt.reasoning.map((step) => (
          <li key={step.statementId}>
            {solidProofRules.find(({ id }) => id === step.ruleId)?.template}{" "}
            {step.accepted ? "✓" : "— проверьте предпосылки"}
          </li>
        ))}
      </ol>
      <button
        disabled={attempt.reasoning.length === 0}
        onClick={() => onAction({ kind: "set-phase", phase: "measurement" })}
        type="button"
      >
        К вычислениям
      </button>
    </section>
  );
}

function MeasurementPhase({
  attempt,
  onAction,
  section,
}: {
  readonly attempt: Solid3DLearningAttempt;
  readonly onAction: (action: SolidLearningAttemptAction) => void;
  readonly section: SolidSectionResult | null;
}): ReactElement {
  const [kind, setKind] = useState<"area" | "perimeter">("area");
  const [raw, setRaw] = useState("");
  const [unit, setUnit] = useState("ед²");
  return (
    <section className="solid-learning-form">
      <h3>Измерения и вычисления</h3>
      <label>
        Величина
        <select
          onChange={(event) => {
            const value = event.currentTarget.value as typeof kind;
            setKind(value);
            setUnit(value === "area" ? "ед²" : "ед");
          }}
          value={kind}
        >
          <option value="area">Площадь</option>
          <option value="perimeter">Периметр</option>
        </select>
      </label>
      <label>
        Формула
        <select>
          <option value="polygon-area">Разбиение на треугольники</option>
          <option value="perimeter-sum">Сумма сторон</option>
        </select>
      </label>
      <label>
        Точное значение
        <input
          placeholder="3/2, 2√3 или 4.25"
          onChange={(event) => setRaw(event.currentTarget.value)}
          value={raw}
        />
      </label>
      <label>
        Единицы
        <input
          onChange={(event) => setUnit(event.currentTarget.value)}
          value={unit}
        />
      </label>
      <button
        disabled={section === null}
        onClick={() => {
          const parsed = parseExactValue(raw);
          const expected = {
            kind: "decimal",
            value: kind === "area" ? section!.area : section!.perimeter,
          } as const;
          const correct =
            parsed !== null &&
            exactValuesEqual(parsed, expected, 0.01) &&
            unit === (kind === "area" ? "ед²" : "ед");
          onAction({
            kind: "submit-answer",
            answer: {
              correct,
              formulaId: kind === "area" ? "polygon-area" : "perimeter-sum",
              parsed,
              raw,
              taskId: `section-${kind}`,
              timestamp: new Date().toISOString(),
              unit,
            },
          });
        }}
        type="button"
      >
        Проверить
      </button>
      {attempt.answers.at(-1) === undefined ? null : (
        <p aria-live="polite">
          {attempt.answers.at(-1)!.correct
            ? "Верно. Значение и единицы согласованы."
            : "Проверьте формулу, вычисление и единицы."}
        </p>
      )}
      <button
        disabled={attempt.answers.length === 0}
        onClick={() => onAction({ kind: "set-phase", phase: "reflection" })}
        type="button"
      >
        К закреплению
      </button>
    </section>
  );
}

function ReflectionPhase({
  attempt,
  onAction,
  onComplete,
}: {
  readonly attempt: Solid3DLearningAttempt;
  readonly onAction: (action: SolidLearningAttemptAction) => void;
  readonly onComplete: () => void;
}): ReactElement {
  const scenario =
    solidLearningScenarios.find(({ id }) => id === attempt.scenarioId) ?? null;
  const quiz = scenario?.followUpQuiz ?? [];
  return (
    <section className="solid-learning-form">
      <h3>Короткое закрепление</h3>
      {quiz.map((item) => (
        <fieldset key={item.id}>
          <legend>{item.prompt}</legend>
          {item.options.map((option, index) => (
            <label key={option}>
              <input
                checked={attempt.quizAnswers[item.id] === String(index)}
                name={item.id}
                onChange={() =>
                  onAction({
                    answer: String(index),
                    itemId: item.id,
                    kind: "answer-quiz",
                  })
                }
                type="radio"
              />
              {option}
            </label>
          ))}
        </fieldset>
      ))}
      <button onClick={onComplete} type="button">
        Завершить и показать итог
      </button>
    </section>
  );
}

export function Solid3DLearningWorkspace(
  props: Solid3DLearningWorkspaceProps,
): ReactElement {
  if (props.attempt === null)
    return (
      <>
        <Catalog
          onStart={props.onStart}
          readOnly={props.readOnly}
          record={props.record}
        />
        <LearningHistory attempts={props.learningAttempts} />
      </>
    );
  const attempt = props.attempt;
  if (attempt.phase === "completed") {
    const analytics = analyzeSolidLearningAttempt(attempt);
    return (
      <section className="solid-learning-summary">
        <h3>Итог учебной попытки</h3>
        <dl>
          <dt>Точность прогноза</dt>
          <dd>{Math.round(analytics.predictionScore * 100)}%</dd>
          <dt>Верные шаги</dt>
          <dd>{analytics.acceptedSteps}</dd>
          <dt>Исправления</dt>
          <dd>{analytics.rejectedSteps}</dd>
          <dt>Подсказки</dt>
          <dd>{attempt.hints.length}</dd>
          <dt>Время</dt>
          <dd>{Math.round(analytics.durationSeconds / 60)} мин</dd>
        </dl>
        <button onClick={props.onReset} type="button">
          Пройти заново
        </button>
      </section>
    );
  }
  return (
    <section className="solid-learning-workspace">
      <header>
        <div>
          <span>
            Шаг{" "}
            {[
              "intro",
              "prediction",
              "construction",
              "reasoning",
              "measurement",
              "reflection",
            ].indexOf(attempt.phase) + 1}{" "}
            из 6
          </span>
          <h3>{attempt.scenarioId}</h3>
        </div>
        <button disabled={props.readOnly} onClick={props.onReset} type="button">
          Сбросить попытку
        </button>
      </header>
      {attempt.phase === "intro" ? (
        <div className="solid-learning-intro">
          <h3>Прогноз → построение → объяснение → проверка</h3>
          <p>Готовый контур останется скрытым до отправки предположения.</p>
          <button
            onClick={() =>
              props.onAction({ kind: "set-phase", phase: "prediction" })
            }
            type="button"
          >
            Начать прогноз
          </button>
        </div>
      ) : null}
      {attempt.phase === "prediction" ? (
        <PredictionPhase
          onAction={props.onAction}
          record={props.record}
          section={props.section}
        />
      ) : null}
      {attempt.phase === "construction" ? (
        <ConstructionPhase
          attempt={attempt}
          highlighted={props.highlighted}
          onAction={props.onAction}
          onHighlight={props.onHighlight}
          onRecordChange={props.onRecordChange}
          record={props.record}
          section={props.section}
        />
      ) : null}
      {attempt.phase === "reasoning" ? (
        <ReasoningPhase attempt={attempt} onAction={props.onAction} />
      ) : null}
      {attempt.phase === "measurement" ? (
        <MeasurementPhase
          attempt={attempt}
          onAction={props.onAction}
          section={props.section}
        />
      ) : null}
      {attempt.phase === "reflection" ? (
        <ReflectionPhase
          attempt={attempt}
          onAction={props.onAction}
          onComplete={props.onComplete}
        />
      ) : null}
    </section>
  );
}

function downloadText(name: string, mimeType: string, value: string): void {
  const link = document.createElement("a");
  link.download = name;
  link.href = URL.createObjectURL(new Blob([value], { type: mimeType }));
  link.click();
  URL.revokeObjectURL(link.href);
}

function LearningHistory({
  attempts,
}: {
  readonly attempts: readonly Solid3DLearningAttempt[];
}): ReactElement | null {
  const [playbackIndex, setPlaybackIndex] = useState(0);
  if (attempts.length === 0) return null;
  const selected = attempts[0]!;
  const trace = selected.construction.trace.slice(0, playbackIndex);
  return (
    <details className="solid-learning-history">
      <summary>Аналитика учителя: {attempts.length} попыток</summary>
      <div className="solid-learning-history-actions">
        <button
          onClick={() =>
            downloadText(
              "solid-learning-report.json",
              "application/json",
              exportLearningAnalyticsJson(attempts),
            )
          }
          type="button"
        >
          Экспорт JSON
        </button>
        <button
          onClick={() =>
            downloadText(
              "solid-learning-report.csv",
              "text/csv;charset=utf-8",
              exportLearningAnalyticsCsv(attempts),
            )
          }
          type="button"
        >
          Экспорт CSV
        </button>
      </div>
      <label>
        Воспроизведение решения: {playbackIndex} /{" "}
        {selected.construction.trace.length}
        <input
          max={selected.construction.trace.length}
          min="0"
          onChange={(event) =>
            setPlaybackIndex(event.currentTarget.valueAsNumber)
          }
          type="range"
          value={playbackIndex}
        />
      </label>
      <ol>
        {trace.map((entry) => (
          <li key={entry.id}>
            {entry.accepted ? "✓" : "⚠"} {entry.explanation}
          </li>
        ))}
      </ol>
    </details>
  );
}
