import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import { createTeacherBoardManagementRepository } from "../adapters/board-http/public";
import type {
  BoardInvitationSecretResult,
  BoardInvitationSummary,
  StandaloneBoardDescriptor,
  StandaloneBoardManagementRepository,
  TeacherManagementContext,
} from "../core/ports/standalone-board-management-repository";
import type { AppEnvironment } from "./configuration/environment";
import "./teacher-boards.css";

type BoardTab = "active" | "archive";
type ExpiryPreset = "1h" | "24h" | "7d" | "never";

interface TeacherBoardsWorkspaceProps {
  readonly context: TeacherManagementContext;
  readonly environment: AppEnvironment;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function invitationIsActive(invitation: BoardInvitationSummary): boolean {
  if (invitation.revokedAt !== null) return false;
  return (
    invitation.expiresAt === null ||
    Date.parse(invitation.expiresAt) > Date.now()
  );
}

function invitationStatus(invitation: BoardInvitationSummary): {
  readonly className: string;
  readonly label: string;
} {
  if (invitation.revokedAt !== null) {
    return { className: "is-revoked", label: "Отозвана" };
  }
  if (
    invitation.expiresAt !== null &&
    Date.parse(invitation.expiresAt) <= Date.now()
  ) {
    return { className: "is-expired", label: "Истекла" };
  }
  if (invitation.useCount === 0) {
    return { className: "is-unused", label: "Ещё не использована" };
  }
  return { className: "is-active", label: "Активна" };
}

function expiryFromPreset(preset: ExpiryPreset): string | null {
  if (preset === "never") return null;
  const milliseconds =
    preset === "1h"
      ? 60 * 60 * 1000
      : preset === "24h"
        ? 24 * 60 * 60 * 1000
        : 7 * 24 * 60 * 60 * 1000;
  return new Date(Date.now() + milliseconds).toISOString();
}

function Modal({
  children,
  labelledBy,
  onClose,
}: {
  readonly children: ReactNode;
  readonly labelledBy: string;
  readonly onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(
    typeof document === "undefined"
      ? null
      : (document.activeElement as HTMLElement | null),
  );

  useEffect(() => {
    const dialog = dialogRef.current;
    const returnFocus = returnFocusRef.current;
    dialog?.showModal();
    return () => {
      if (dialog?.open) dialog.close();
      window.setTimeout(() => returnFocus?.focus(), 0);
    };
  }, []);

  const close = () => {
    dialogRef.current?.close();
    onClose();
  };

  return (
    <dialog
      aria-labelledby={labelledBy}
      className="teacher-modal"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      ref={dialogRef}
    >
      <div className="teacher-modal__surface">{children}</div>
    </dialog>
  );
}

function CreateBoardDialog({
  onClose,
  onCreate,
}: {
  readonly onClose: () => void;
  readonly onCreate: (title: string) => Promise<void>;
}) {
  const [title, setTitle] = useState("Новая доска");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const normalized = title.trim();
    if (normalized.length === 0) {
      setError("Введите название доски.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onCreate(normalized);
      onClose();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Не удалось создать доску.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal labelledBy="create-board-title" onClose={onClose}>
      <form className="teacher-form" onSubmit={(event) => void submit(event)}>
        <header>
          <p className="teacher-eyebrow">Новая рабочая область</p>
          <h2 id="create-board-title">Создать доску</h2>
        </header>
        <label>
          Название
          <input
            autoFocus
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
            required
            value={title}
          />
        </label>
        {error === null ? null : <p role="alert">{error}</p>}
        <footer className="teacher-modal__actions">
          <button disabled={busy} onClick={onClose} type="button">
            Отмена
          </button>
          <button className="is-primary" disabled={busy} type="submit">
            {busy ? "Создаём…" : "Создать"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}

function RenameBoardDialog({
  board,
  onClose,
  onRename,
}: {
  readonly board: StandaloneBoardDescriptor;
  readonly onClose: () => void;
  readonly onRename: (title: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(board.title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const normalized = title.trim();
    if (normalized.length === 0) {
      setError("Название не может быть пустым.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onRename(normalized);
      onClose();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Не удалось переименовать доску.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal labelledBy="rename-board-title" onClose={onClose}>
      <form className="teacher-form" onSubmit={(event) => void submit(event)}>
        <header>
          <p className="teacher-eyebrow">Доска</p>
          <h2 id="rename-board-title">Переименовать</h2>
        </header>
        <label>
          Название
          <input
            autoFocus
            maxLength={200}
            onChange={(event) => setTitle(event.target.value)}
            required
            value={title}
          />
        </label>
        {error === null ? null : <p role="alert">{error}</p>}
        <footer className="teacher-modal__actions">
          <button disabled={busy} onClick={onClose} type="button">
            Отмена
          </button>
          <button className="is-primary" disabled={busy} type="submit">
            Сохранить
          </button>
        </footer>
      </form>
    </Modal>
  );
}

function SecretResultPanel({
  result,
  onDismiss,
}: {
  readonly result: BoardInvitationSecretResult;
  readonly onDismiss: () => void;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "manual">(
    "idle",
  );
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (copyState !== "manual") return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [copyState]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.joinUrl);
      setCopyState("copied");
    } catch {
      setCopyState("manual");
    }
  };

  return (
    <section aria-label="Новая гостевая ссылка" className="secret-result">
      <div>
        <strong>Ссылка готова</strong>
        <p>
          Она показывается только сейчас. После закрытия получить тот же секрет
          повторно нельзя.
        </p>
      </div>
      <label>
        Гостевая ссылка
        <input
          onFocus={(event) => event.currentTarget.select()}
          readOnly
          ref={inputRef}
          value={result.joinUrl}
        />
      </label>
      <div className="secret-result__actions">
        <button
          className="is-primary"
          onClick={() => void copy()}
          type="button"
        >
          Скопировать ссылку
        </button>
        <button onClick={onDismiss} type="button">
          Скрыть ссылку
        </button>
      </div>
      {copyState === "copied" ? <p role="status">Ссылка скопирована.</p> : null}
      {copyState === "manual" ? (
        <p role="status">
          Буфер обмена недоступен. Ссылка выделена — скопируйте её вручную.
        </p>
      ) : null}
    </section>
  );
}

function InvitationRow({
  invitation,
  onChanged,
  onRotate,
  repository,
}: {
  readonly invitation: BoardInvitationSummary;
  readonly onChanged: () => Promise<void>;
  readonly onRotate: (result: BoardInvitationSecretResult) => void;
  readonly repository: StandaloneBoardManagementRepository;
}) {
  const [displayName, setDisplayName] = useState(invitation.displayName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = invitationStatus(invitation);

  const execute = async (operation: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await operation();
      await onChanged();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Не удалось изменить приглашение.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="invitation-row">
      <header>
        <div>
          <strong>{invitation.displayName}</strong>
          <span className={`invitation-status ${status.className}`}>
            {status.label}
          </span>
        </div>
        <small>
          {invitation.lastUsedAt === null
            ? "Открытий пока не было"
            : `Последний вход: ${formatDate(invitation.lastUsedAt)} · ${invitation.useCount}`}
        </small>
      </header>

      <div className="invitation-row__grid">
        <label>
          Имя ученика
          <input
            disabled={busy}
            maxLength={160}
            onChange={(event) => setDisplayName(event.target.value)}
            value={displayName}
          />
        </label>
        <button
          disabled={busy || displayName.trim() === invitation.displayName}
          onClick={() =>
            void execute(() =>
              repository.updateInvitation(
                invitation.boardId,
                invitation.invitationId,
                {
                  displayName: displayName.trim(),
                },
              ),
            )
          }
          type="button"
        >
          Сохранить имя
        </button>

        <label className="teacher-switch">
          <input
            checked={invitation.writeEnabled}
            disabled={busy || invitation.revokedAt !== null}
            onChange={(event) =>
              void execute(() =>
                repository.updateInvitation(
                  invitation.boardId,
                  invitation.invitationId,
                  {
                    writeEnabled: event.target.checked,
                  },
                ),
              )
            }
            type="checkbox"
          />
          <span>Разрешить редактирование</span>
        </label>

        <label>
          Новый срок ссылки
          <select
            defaultValue="24h"
            disabled={busy || invitation.revokedAt !== null}
            onChange={(event) => {
              const preset = event.target.value as ExpiryPreset;
              void execute(() =>
                repository.updateInvitation(
                  invitation.boardId,
                  invitation.invitationId,
                  {
                    expiresAt: expiryFromPreset(preset),
                  },
                ),
              );
            }}
          >
            <option value="1h">ещё 1 час</option>
            <option value="24h">ещё 24 часа</option>
            <option value="7d">ещё 7 дней</option>
            <option value="never">до отзыва</option>
          </select>
        </label>
      </div>

      <p className="invitation-row__expiry">
        {invitation.expiresAt === null
          ? "Срок: до отзыва"
          : `Срок: ${formatDate(invitation.expiresAt)}`}
      </p>

      <footer className="invitation-row__actions">
        <button
          disabled={busy}
          onClick={() =>
            void execute(async () => {
              const result = await repository.rotateInvitation(
                invitation.boardId,
                invitation.invitationId,
              );
              onRotate(result);
            })
          }
          type="button"
        >
          Ротировать и получить новую ссылку
        </button>
        <button
          className="is-danger"
          disabled={busy || invitation.revokedAt !== null}
          onClick={() =>
            void execute(() =>
              repository.revokeInvitation(
                invitation.boardId,
                invitation.invitationId,
              ),
            )
          }
          type="button"
        >
          Отозвать
        </button>
      </footer>
      {error === null ? null : <p role="alert">{error}</p>}
    </article>
  );
}

function InvitationDialog({
  board,
  onClose,
  onInvitationsChanged,
  repository,
}: {
  readonly board: StandaloneBoardDescriptor;
  readonly onClose: () => void;
  readonly onInvitationsChanged: () => Promise<void>;
  readonly repository: StandaloneBoardManagementRepository;
}) {
  const [invitations, setInvitations] = useState<
    readonly BoardInvitationSummary[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [expiryPreset, setExpiryPreset] = useState<ExpiryPreset>("24h");
  const [writeEnabled, setWriteEnabled] = useState(true);
  const [creating, setCreating] = useState(false);
  const [secretResult, setSecretResult] =
    useState<BoardInvitationSecretResult | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setInvitations(await repository.listInvitations(board.boardId));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Не удалось загрузить приглашения.",
      );
    } finally {
      setLoading(false);
    }
  }, [board.boardId, repository]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const refresh = async () => {
    await load();
    await onInvitationsChanged();
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedName = displayName.trim();
    if (normalizedName.length === 0) {
      setError("Введите имя ученика.");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const result = await repository.createInvitation(board.boardId, {
        displayName: normalizedName,
        expiresAt: expiryFromPreset(expiryPreset),
        writeEnabled,
      });
      setSecretResult(result);
      setDisplayName("");
      await refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Не удалось создать приглашение.",
      );
    } finally {
      setCreating(false);
    }
  };

  const close = () => {
    setSecretResult(null);
    onClose();
  };

  return (
    <Modal labelledBy="invitation-dialog-title" onClose={close}>
      <div className="invitation-dialog">
        <header className="teacher-modal__header">
          <div>
            <p className="teacher-eyebrow">Доступ ученика</p>
            <h2 id="invitation-dialog-title">{board.title}</h2>
            <p>
              Каждая ссылка независима: её права, срок и отзыв не затрагивают
              другие ссылки.
            </p>
          </div>
          <button
            aria-label="Закрыть управление доступом"
            onClick={close}
            type="button"
          >
            ×
          </button>
        </header>

        {secretResult === null ? null : (
          <SecretResultPanel
            result={secretResult}
            onDismiss={() => setSecretResult(null)}
          />
        )}

        <form
          className="invitation-create"
          onSubmit={(event) => void create(event)}
        >
          <h3>Новая ссылка</h3>
          <label>
            Имя ученика
            <input
              maxLength={160}
              onChange={(event) => setDisplayName(event.target.value)}
              placeholder="Например, Ксения"
              required
              value={displayName}
            />
          </label>
          <label>
            Срок действия
            <select
              onChange={(event) =>
                setExpiryPreset(event.target.value as ExpiryPreset)
              }
              value={expiryPreset}
            >
              <option value="1h">1 час</option>
              <option value="24h">24 часа</option>
              <option value="7d">7 дней</option>
              <option value="never">До отзыва</option>
            </select>
          </label>
          <label className="teacher-switch">
            <input
              checked={writeEnabled}
              onChange={(event) => setWriteEnabled(event.target.checked)}
              type="checkbox"
            />
            <span>Разрешить ученику редактировать доску</span>
          </label>
          <button className="is-primary" disabled={creating} type="submit">
            {creating ? "Создаём…" : "Создать гостевую ссылку"}
          </button>
        </form>

        <section
          aria-labelledby="issued-links-title"
          className="invitation-list"
        >
          <div className="invitation-list__heading">
            <h3 id="issued-links-title">Выданные ссылки</h3>
            <span>{invitations.length}</span>
          </div>
          {loading ? (
            <p aria-live="polite">Загружаем приглашения…</p>
          ) : invitations.length === 0 ? (
            <p className="teacher-empty">Пока нет выданных ссылок.</p>
          ) : (
            invitations.map((invitation) => (
              <InvitationRow
                invitation={invitation}
                key={invitation.invitationId}
                onChanged={refresh}
                onRotate={setSecretResult}
                repository={repository}
              />
            ))
          )}
        </section>
        {error === null ? null : <p role="alert">{error}</p>}
      </div>
    </Modal>
  );
}

export function TeacherBoardsWorkspace({
  context,
  environment,
}: TeacherBoardsWorkspaceProps) {
  const repository = useMemo(
    () =>
      createTeacherBoardManagementRepository(context, {
        baseUrl: environment.boardApiBaseUrl,
      }),
    [context, environment.boardApiBaseUrl],
  );
  const [boards, setBoards] = useState<readonly StandaloneBoardDescriptor[]>(
    [],
  );
  const [invitationCounts, setInvitationCounts] = useState<
    Readonly<Record<string, number>>
  >({});
  const [tab, setTab] = useState<BoardTab>("active");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [renameBoard, setRenameBoard] =
    useState<StandaloneBoardDescriptor | null>(null);
  const [accessBoard, setAccessBoard] =
    useState<StandaloneBoardDescriptor | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [busyBoardId, setBusyBoardId] = useState<string | null>(null);

  const refreshBoards = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await repository.listBoards(true);
      setBoards(items);
      const countEntries = await Promise.all(
        items.map(async (board) => {
          try {
            const invitations = await repository.listInvitations(board.boardId);
            return [
              board.boardId,
              invitations.filter(invitationIsActive).length,
            ] as const;
          } catch {
            return [board.boardId, 0] as const;
          }
        }),
      );
      setInvitationCounts(Object.fromEntries(countEntries));
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Не удалось загрузить доски.",
      );
    } finally {
      setLoading(false);
    }
  }, [repository]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refreshBoards(), 0);
    return () => window.clearTimeout(timer);
  }, [refreshBoards]);

  const performBoardAction = async (
    board: StandaloneBoardDescriptor,
    operation: () => Promise<unknown>,
    message: string,
  ) => {
    setBusyBoardId(board.boardId);
    setError(null);
    try {
      await operation();
      setStatus(message);
      setDeleteConfirmId(null);
      await refreshBoards();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Не удалось изменить доску.",
      );
    } finally {
      setBusyBoardId(null);
    }
  };

  const visibleBoards = boards.filter((board) =>
    tab === "active" ? board.archivedAt === null : board.archivedAt !== null,
  );
  const activeCount = boards.filter(
    (board) => board.archivedAt === null,
  ).length;
  const archivedCount = boards.length - activeCount;

  return (
    <main className="teacher-boards-page">
      <header className="teacher-boards-header">
        <div>
          <p className="teacher-eyebrow">TutorBoard · преподаватель</p>
          <h1>Мои доски</h1>
          <p>
            Создавайте отдельные доски и выдавайте ученикам ограниченные
            гостевые ссылки без регистрации.
          </p>
        </div>
        <button
          className="is-primary teacher-create-board"
          onClick={() => setCreateOpen(true)}
          type="button"
        >
          + Создать доску
        </button>
      </header>

      <nav aria-label="Фильтр досок" className="teacher-tabs">
        <button
          aria-current={tab === "active" ? "page" : undefined}
          onClick={() => setTab("active")}
          type="button"
        >
          Активные <span>{activeCount}</span>
        </button>
        <button
          aria-current={tab === "archive" ? "page" : undefined}
          onClick={() => setTab("archive")}
          type="button"
        >
          Архив <span>{archivedCount}</span>
        </button>
      </nav>

      {status === null ? null : (
        <div className="teacher-status" role="status">
          <span>{status}</span>
          <button
            aria-label="Закрыть сообщение"
            onClick={() => setStatus(null)}
            type="button"
          >
            ×
          </button>
        </div>
      )}
      {error === null ? null : (
        <div className="teacher-error" role="alert">
          <span>{error}</span>
          <button onClick={() => void refreshBoards()} type="button">
            Повторить
          </button>
        </div>
      )}

      {loading && boards.length === 0 ? (
        <section aria-live="polite" className="teacher-empty">
          Загружаем доски…
        </section>
      ) : visibleBoards.length === 0 ? (
        <section className="teacher-empty">
          <strong>
            {tab === "active" ? "Активных досок пока нет" : "Архив пуст"}
          </strong>
          <p>
            {tab === "active"
              ? "Создайте первую доску и выпустите ссылку для ученика."
              : "Архивированные доски появятся здесь."}
          </p>
        </section>
      ) : (
        <section
          aria-label={tab === "active" ? "Активные доски" : "Архивные доски"}
          className="teacher-board-grid"
        >
          {visibleBoards.map((board) => {
            const busy = busyBoardId === board.boardId;
            return (
              <article className="teacher-board-card" key={board.boardId}>
                <header>
                  <div>
                    <span
                      aria-hidden="true"
                      className="teacher-board-card__icon"
                    >
                      ▦
                    </span>
                    <div>
                      <h2>{board.title}</h2>
                      <p>
                        Ревизия {board.currentRevision} · обновлена{" "}
                        {formatDate(board.updatedAt)}
                      </p>
                    </div>
                  </div>
                  {board.archivedAt === null ? null : (
                    <span className="teacher-board-card__archived">Архив</span>
                  )}
                </header>

                <dl className="teacher-board-meta">
                  <div>
                    <dt>Активные ссылки</dt>
                    <dd>{invitationCounts[board.boardId] ?? 0}</dd>
                  </div>
                  <div>
                    <dt>Гостевая запись</dt>
                    <dd>
                      {board.guestWritesEnabled
                        ? "Разрешена по ссылке"
                        : "Только чтение"}
                    </dd>
                  </div>
                </dl>

                <label className="teacher-switch teacher-board-write-switch">
                  <input
                    checked={board.guestWritesEnabled}
                    disabled={busy || board.archivedAt !== null}
                    onChange={(event) =>
                      void performBoardAction(
                        board,
                        () =>
                          repository.updateBoard(board.boardId, {
                            guestWritesEnabled: event.target.checked,
                          }),
                        event.target.checked
                          ? "Гостевая запись на доске разрешена."
                          : "Все гостевые ссылки переведены в режим чтения.",
                      )
                    }
                    type="checkbox"
                  />
                  <span>
                    Разрешать запись гостям, у которых она включена в ссылке
                  </span>
                </label>

                <footer className="teacher-board-actions">
                  <a
                    className="is-primary"
                    href={`/b/${encodeURIComponent(board.boardId)}#/board`}
                  >
                    Открыть
                  </a>
                  <button
                    disabled={busy}
                    onClick={() => setAccessBoard(board)}
                    type="button"
                  >
                    Доступ и ссылки
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => setRenameBoard(board)}
                    type="button"
                  >
                    Переименовать
                  </button>
                  {board.archivedAt === null ? (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void performBoardAction(
                          board,
                          () => repository.archiveBoard(board.boardId),
                          "Доска перенесена в архив.",
                        )
                      }
                      type="button"
                    >
                      В архив
                    </button>
                  ) : (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void performBoardAction(
                          board,
                          () => repository.unarchiveBoard(board.boardId),
                          "Доска восстановлена.",
                        )
                      }
                      type="button"
                    >
                      Восстановить
                    </button>
                  )}
                  {deleteConfirmId === board.boardId ? (
                    <span className="delete-confirm">
                      <span>Удалить доску?</span>
                      <button
                        className="is-danger"
                        disabled={busy}
                        onClick={() =>
                          void performBoardAction(
                            board,
                            () => repository.deleteBoard(board.boardId),
                            "Доска удалена.",
                          )
                        }
                        type="button"
                      >
                        Да, удалить
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        type="button"
                      >
                        Отмена
                      </button>
                    </span>
                  ) : (
                    <button
                      className="is-danger-link"
                      disabled={busy}
                      onClick={() => setDeleteConfirmId(board.boardId)}
                      type="button"
                    >
                      Удалить
                    </button>
                  )}
                </footer>
              </article>
            );
          })}
        </section>
      )}

      {createOpen ? (
        <CreateBoardDialog
          onClose={() => setCreateOpen(false)}
          onCreate={async (title) => {
            const board = await repository.createBoard(title);
            await refreshBoards();
            setStatus("Доска создана.");
            window.location.href = `/b/${encodeURIComponent(board.boardId)}#/board`;
          }}
        />
      ) : null}
      {renameBoard === null ? null : (
        <RenameBoardDialog
          board={renameBoard}
          onClose={() => setRenameBoard(null)}
          onRename={async (title) => {
            await repository.updateBoard(renameBoard.boardId, { title });
            await refreshBoards();
            setStatus("Название доски обновлено.");
          }}
        />
      )}
      {accessBoard === null ? null : (
        <InvitationDialog
          board={accessBoard}
          onClose={() => setAccessBoard(null)}
          onInvitationsChanged={refreshBoards}
          repository={repository}
        />
      )}
    </main>
  );
}
