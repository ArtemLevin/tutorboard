import type {
  HandwrittenFunctionInterpretation,
  HandwrittenFunctionInterpretedCandidate,
  HandwrittenFunctionSessionState,
} from "../modules/handwritten-function/public";

export interface HandwrittenFunctionPanelProps {
  readonly canBuild: boolean;
  readonly canRecognize: boolean;
  readonly diagnostic: string | null;
  readonly draftCandidate: HandwrittenFunctionInterpretedCandidate | null;
  readonly draftExpression: string;
  readonly draftIssue: string | null;
  readonly interpretation: HandwrittenFunctionInterpretation | null;
  readonly recognizerAvailable: boolean;
  readonly session: HandwrittenFunctionSessionState;
  readonly sourcePersisted: boolean;
  readonly onBuild: () => void;
  readonly onCandidateSelect: (expression: string) => void;
  readonly onClear: () => void;
  readonly onDraftChange: (expression: string) => void;
  readonly onKeepInk: () => void;
  readonly onRecognize: () => void;
}

function completedStrokeCount(state: HandwrittenFunctionSessionState): number {
  return state.kind === "idle" ? 0 : state.strokes.length;
}

function statusLabel(state: HandwrittenFunctionSessionState): string {
  switch (state.kind) {
    case "idle":
      return "Ожидание ввода";
    case "collecting":
      return state.activeStroke === null ? "Ввод штрихов" : "Рисование штриха";
    case "ready":
      return "Готово к распознаванию";
    case "recognizing":
      return "Распознавание…";
    case "resolved":
      return "Результат получен";
    case "failed":
      return "Ошибка распознавания";
  }
}

export function HandwrittenFunctionPanel({
  canBuild,
  canRecognize,
  diagnostic,
  draftCandidate,
  draftExpression,
  draftIssue,
  interpretation,
  recognizerAvailable,
  session,
  sourcePersisted,
  onBuild,
  onCandidateSelect,
  onClear,
  onDraftChange,
  onKeepInk,
  onRecognize,
}: HandwrittenFunctionPanelProps) {
  const candidates = interpretation?.candidates ?? [];
  const recognizing = session.kind === "recognizing";
  const parameterNames = draftCandidate?.parameters ?? [];

  return (
    <aside
      aria-label="Рукописная функция"
      className="handwritten-function-panel"
    >
      <div className="handwritten-function-heading">
        <div>
          <strong>Рукописная функция</strong>
          <span role="status">{statusLabel(session)}</span>
        </div>
        <button
          aria-label="Закрыть и оставить рукописные штрихи"
          onClick={onKeepInk}
          type="button"
        >
          ×
        </button>
      </div>

      <div className="handwritten-function-summary">
        <span>Штрихов: {completedStrokeCount(session)}</span>
        <span>
          {sourcePersisted ? "Штрихи сохранены" : "Черновик на полотне"}
        </span>
      </div>

      {!recognizerAvailable ? (
        <p className="handwritten-function-guidance">
          Автоматический распознаватель пока не подключён. Сохраните штрихи и
          введите функцию вручную.
        </p>
      ) : (
        <p className="handwritten-function-guidance">
          Завершите все штрихи, затем запустите распознавание.
        </p>
      )}

      <div className="handwritten-function-actions">
        <button
          disabled={!canRecognize || recognizing}
          onClick={onRecognize}
          type="button"
        >
          {recognizing
            ? "Распознавание…"
            : recognizerAvailable
              ? "Распознать"
              : "Сохранить штрихи"}
        </button>
        <button disabled={recognizing} onClick={onClear} type="button">
          Очистить
        </button>
        <button onClick={onKeepInk} type="button">
          Оставить штрихи
        </button>
      </div>

      {candidates.length <= 1 ? null : (
        <section
          aria-label="Варианты распознавания"
          className="handwritten-function-candidates"
        >
          <strong>Варианты</strong>
          <div>
            {candidates.map((candidate) => (
              <button
                aria-pressed={draftExpression === candidate.expression}
                key={`${candidate.candidateIndex}:${candidate.normalizedExpression}`}
                onClick={() => onCandidateSelect(candidate.expression)}
                type="button"
              >
                <code>{candidate.expression}</code>
                <span>
                  {candidate.confidence === null
                    ? "оценка отсутствует"
                    : `${Math.round(candidate.confidence * 100)}%`}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <label className="handwritten-function-expression">
        <span>Функция y =</span>
        <input
          aria-describedby="handwritten-function-expression-help"
          autoComplete="off"
          disabled={recognizing}
          maxLength={8_192}
          onChange={(event) => onDraftChange(event.currentTarget.value)}
          placeholder="x^2 - 4*x + 3"
          spellCheck={false}
          value={draftExpression}
        />
      </label>
      <small id="handwritten-function-expression-help">
        Поддерживаются функции и параметры языка координатных графиков
        TutorBoard.
      </small>

      {parameterNames.length === 0 ? null : (
        <div className="handwritten-function-parameters">
          <strong>Параметры</strong>
          <span>{parameterNames.join(", ")}</span>
        </div>
      )}

      {draftIssue === null ? null : (
        <p className="handwritten-function-error" role="alert">
          {draftIssue}
        </p>
      )}
      {diagnostic === null ? null : (
        <p className="handwritten-function-diagnostic" role="status">
          {diagnostic}
        </p>
      )}

      <button
        className="handwritten-function-build"
        disabled={!canBuild || recognizing}
        onClick={onBuild}
        type="button"
      >
        Построить график
      </button>
    </aside>
  );
}
