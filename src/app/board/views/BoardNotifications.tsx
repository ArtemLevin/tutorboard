import type { AppPersistenceStatus } from "../types";

export interface BoardNotificationsProps {
  readonly accessibilityNotice: string | null;
  readonly clipboardNotice: string | null;
  readonly mediaDiagnostic: string | null;
  readonly onRetryPersistence?: (() => void) | undefined;
  readonly persistenceNotice: string | null;
  readonly persistenceStatus: AppPersistenceStatus;
  readonly smartInkNotice: string | null;
}

export function BoardNotifications({
  accessibilityNotice,
  clipboardNotice,
  mediaDiagnostic,
  onRetryPersistence,
  persistenceNotice,
  persistenceStatus,
  smartInkNotice,
}: BoardNotificationsProps) {
  return (
    <>
      {persistenceNotice === null ? null : (
        <div className="board-toast is-info" role="status">
          {persistenceNotice}
        </div>
      )}
      {mediaDiagnostic === null ? null : (
        <div className="board-toast is-error" role="alert">
          {mediaDiagnostic}
        </div>
      )}
      {clipboardNotice === null ? null : (
        <div className="board-toast is-info" role="status">
          {clipboardNotice}
        </div>
      )}
      {smartInkNotice === null ? null : (
        <div className="board-toast is-info" role="status">
          {smartInkNotice}
        </div>
      )}
      {persistenceStatus.kind === "error" ||
      persistenceStatus.kind === "conflict" ? (
        <div className="board-toast is-error" role="alert">
          <strong>{persistenceStatus.label}</strong>
          {persistenceStatus.detail === undefined ? null : (
            <span>{persistenceStatus.detail}</span>
          )}
          {persistenceStatus.retryable === true &&
          onRetryPersistence !== undefined ? (
            <button onClick={onRetryPersistence} type="button">
              Повторить
            </button>
          ) : null}
        </div>
      ) : null}
      <div aria-atomic="true" aria-live="polite" className="visually-hidden">
        {accessibilityNotice}
      </div>
    </>
  );
}
