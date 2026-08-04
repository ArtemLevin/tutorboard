import type {
  GeometryOsAmbiguity,
  GeometryOsNotice,
  GeometryOsRequestId,
} from "../core/public";
import type { GeometryPromptStage } from "../modules/geometry-prompt/public";
import type { TextShapeDefinition } from "../modules/text-shape-placement/public";

export type GeometryPromptViewState =
  | { readonly kind: "idle" }
  | {
      readonly kind: "awaiting-placement";
      readonly label: string;
      readonly source: "catalog" | "geometryos";
    }
  | {
      readonly kind: "running";
      readonly requestId: GeometryOsRequestId | null;
      readonly stage: GeometryPromptStage;
    }
  | {
      readonly kind: "success";
      readonly objectCount: number;
      readonly requestId: GeometryOsRequestId | null;
    }
  | {
      readonly ambiguities: readonly GeometryOsAmbiguity[];
      readonly kind: "needs-clarification";
      readonly requestId: GeometryOsRequestId;
    }
  | {
      readonly kind: "domain-error";
      readonly requestId: GeometryOsRequestId;
      readonly warnings: readonly GeometryOsNotice[];
    }
  | {
      readonly code: string;
      readonly kind: "failure";
      readonly requestId: GeometryOsRequestId | null;
      readonly retryable: boolean;
      readonly stage: GeometryPromptStage;
    };

interface GeometryPromptPanelProps {
  readonly autoLabelVertices: boolean;
  readonly onCancel: () => void;
  readonly onAutoLabelVerticesChange: (value: boolean) => void;
  readonly onChooseClarification: (option: string) => void;
  readonly onPromptChange: (prompt: string) => void;
  readonly onRetry: () => void;
  readonly onSuggestionChoose: (definition: TextShapeDefinition) => void;
  readonly onSubmit: () => void;
  readonly prompt: string;
  readonly remoteAvailable: boolean;
  readonly state: GeometryPromptViewState;
  readonly suggestions: readonly TextShapeDefinition[];
}

const stageLabels: Readonly<Record<GeometryPromptStage, string>> = {
  readiness: "Проверяем готовность GeometryOS…",
  generate: "Строим математическую модель…",
  layout: "Рассчитываем размещение…",
  import: "Добавляем построение на доску…",
};

function RequestIdView({
  requestId,
}: {
  readonly requestId: GeometryOsRequestId | null;
}) {
  return requestId === null ? null : (
    <code data-testid="geometry-request-id">{requestId}</code>
  );
}

export function GeometryPromptPanel({
  autoLabelVertices,
  onCancel,
  onAutoLabelVerticesChange,
  onChooseClarification,
  onPromptChange,
  onRetry,
  onSuggestionChoose,
  onSubmit,
  prompt,
  remoteAvailable,
  state,
  suggestions,
}: GeometryPromptPanelProps) {
  const running = state.kind === "running";

  return (
    <aside
      aria-label="Построение через GeometryOS"
      className="geometry-prompt-panel"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <label htmlFor="geometry-prompt">
          <strong>Геометрическое построение</strong>
          <span>Опишите фигуру естественным языком</span>
        </label>
        <textarea
          aria-label="Запрос GeometryOS"
          disabled={running}
          id="geometry-prompt"
          maxLength={20_000}
          onChange={(event) => onPromptChange(event.target.value)}
          rows={2}
          value={prompt}
        />
        <div className="geometry-prompt-actions">
          <button
            disabled={running || prompt.trim().length === 0}
            type="submit"
          >
            Выбрать для размещения
          </button>
          {running ? (
            <button onClick={onCancel} type="button">
              Отменить
            </button>
          ) : state.kind === "failure" && state.retryable ? (
            <button onClick={onRetry} type="button">
              Повторить
            </button>
          ) : null}
        </div>
        <label className="geometry-prompt-check">
          <input
            checked={autoLabelVertices}
            disabled={running}
            onChange={(event) =>
              onAutoLabelVerticesChange(event.currentTarget.checked)
            }
            type="checkbox"
          />
          <span>Автоматически называть вершины</span>
        </label>
      </form>

      {suggestions.length === 0 ? null : (
        <div aria-label="Предложения фигур" className="geometry-suggestions">
          <span>Подходящие фигуры:</span>
          <div>
            {suggestions.map((definition) => (
              <button
                key={definition.id}
                onClick={() => onSuggestionChoose(definition)}
                type="button"
              >
                {definition.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {!remoteAvailable && suggestions.length === 0 ? (
        <p className="geometry-prompt-status" role="status">
          Выберите фигуру из локального каталога. Свободные запросы требуют
          подключения GeometryOS.
        </p>
      ) : state.kind === "awaiting-placement" ? (
        <p
          aria-live="polite"
          className="geometry-prompt-status is-success"
          data-testid="geometry-prompt-status"
        >
          Выбрано построение «{state.label}». Щёлкните по месту на доске.
        </p>
      ) : state.kind === "running" ? (
        <p
          aria-live="polite"
          className="geometry-prompt-status"
          data-testid="geometry-prompt-status"
        >
          <span>{stageLabels[state.stage]}</span>
          <RequestIdView requestId={state.requestId} />
        </p>
      ) : state.kind === "success" ? (
        <p
          aria-live="polite"
          className="geometry-prompt-status is-success"
          data-testid="geometry-prompt-status"
        >
          <span>Построение добавлено: {state.objectCount} объектов.</span>
          <RequestIdView requestId={state.requestId} />
        </p>
      ) : state.kind === "needs-clarification" ? (
        <div
          className="geometry-prompt-status"
          data-testid="geometry-prompt-status"
          role="status"
        >
          <span>GeometryOS просит уточнить запрос:</span>
          <ul>
            {state.ambiguities.flatMap((item) =>
              item.options.map((option) => (
                <li key={`${item.code}:${option}`}>
                  <button
                    onClick={() => onChooseClarification(option)}
                    type="button"
                  >
                    {option}
                  </button>
                </li>
              )),
            )}
          </ul>
          <RequestIdView requestId={state.requestId} />
        </div>
      ) : state.kind === "domain-error" ? (
        <p
          className="geometry-prompt-status is-error"
          data-testid="geometry-prompt-status"
          role="alert"
        >
          <span>
            Построение не поддержано
            {state.warnings.length === 0
              ? "."
              : `: ${state.warnings.map((item) => item.code).join(", ")}.`}
          </span>
          <RequestIdView requestId={state.requestId} />
        </p>
      ) : state.kind === "failure" ? (
        <p
          className="geometry-prompt-status is-error"
          data-testid="geometry-prompt-status"
          role="alert"
        >
          <span>
            {stageLabels[state.stage]} {state.code}
          </span>
          <RequestIdView requestId={state.requestId} />
        </p>
      ) : null}
    </aside>
  );
}
