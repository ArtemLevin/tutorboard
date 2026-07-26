import type {
  GeometryOsAmbiguity,
  GeometryOsNotice,
  GeometryOsRequestId,
} from "../core/public";
import type { GeometryPromptStage } from "../modules/geometry-prompt/public";

export type GeometryPromptViewState =
  | { readonly kind: "idle" }
  | {
      readonly kind: "running";
      readonly requestId: GeometryOsRequestId | null;
      readonly stage: GeometryPromptStage;
    }
  | {
      readonly kind: "success";
      readonly objectCount: number;
      readonly requestId: GeometryOsRequestId;
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
  readonly available: boolean;
  readonly onCancel: () => void;
  readonly onChooseClarification: (option: string) => void;
  readonly onPromptChange: (prompt: string) => void;
  readonly onRetry: () => void;
  readonly onSubmit: () => void;
  readonly prompt: string;
  readonly state: GeometryPromptViewState;
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
  available,
  onCancel,
  onChooseClarification,
  onPromptChange,
  onRetry,
  onSubmit,
  prompt,
  state,
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
            disabled={!available || running || prompt.trim().length === 0}
            type="submit"
          >
            Построить
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
      </form>

      {!available ? (
        <p className="geometry-prompt-status" role="status">
          GeometryOS не настроен для этого запуска.
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
