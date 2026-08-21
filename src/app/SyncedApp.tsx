import { useCallback, useEffect, useRef, useState } from "react";

import {
  BoardCollaborationClient,
  type BoardAccessControlEvent,
  type BoardCollaborationStatus,
  type BoardInkPreview,
  type BoardPresence,
  type BoardTransformPreview,
} from "../adapters/board-websocket/public";
import type {
  BoardAccessContext,
  BoardRuntimeAccessContext,
} from "../core/access/public";
import {
  reduceBoardDocument,
  type BoardCommand,
  type BoardDocument,
  type BoardEvidenceDescriptor,
  type DocumentId,
  type GeometryOsClient,
  type PendingBoardCommandQueue,
} from "../core/public";
import type {
  BoardCollaborationRepository,
  BoardEvidenceRepository,
  BoardSyncRepository,
  BoardTelemetryRepository,
  LegacyBoardLifecycleRepository,
} from "../core/ports/public";
import {
  boardDocumentSha256,
  BoardSyncEngine,
  invertOwnBoardCommand,
  type BoardSyncState,
} from "../modules/server-sync/public";
import {
  renderBoardSnapshotPng,
  renderBoardSnapshotPdf,
  renderBoardSnapshotSvg,
} from "../modules/document-transfer/public";
import type { MathInkRecognizer } from "../modules/handwritten-function/public";
import { App, type AppPersistenceStatus } from "./App";
import { copyBoardShareUrl } from "./board-chrome/board-share";
import { canFinalizeBoardEvidence } from "./synced-evidence";

type SyncedBoardRepository = BoardCollaborationRepository &
  BoardEvidenceRepository &
  BoardSyncRepository &
  BoardTelemetryRepository &
  LegacyBoardLifecycleRepository;

interface SyncedAppProps {
  readonly accessContext?: BoardRuntimeAccessContext | undefined;
  readonly documentId: DocumentId;
  readonly geometryOsClient?: GeometryOsClient | undefined;
  readonly lessonId?: string | undefined;
  readonly mathInkRecognizer?: MathInkRecognizer | undefined;
  readonly queue: PendingBoardCommandQueue;
  readonly refreshAccessContext?:
    (() => Promise<BoardAccessContext>) | undefined;
  readonly repository: SyncedBoardRepository;
}

type AccessRefreshStatus = "failed" | "idle" | "refreshing" | "revoked";

const boardOriginStorageKey = "tutorboard.collaboration-origin.v1";

function collaborationOriginId(): string {
  try {
    const stored = window.localStorage.getItem(boardOriginStorageKey);
    if (stored !== null && /^origin:[A-Za-z0-9-]{1,120}$/u.test(stored)) {
      return stored;
    }
    const created = `origin:${crypto.randomUUID()}`;
    window.localStorage.setItem(boardOriginStorageKey, created);
    return created;
  } catch {
    return `origin:${crypto.randomUUID()}`;
  }
}

async function blobBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 32_768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32_768));
  }
  return btoa(binary);
}

function downloadRecovery(document: BoardDocument): void {
  const blob = new Blob([JSON.stringify(document, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.download = "tutorboard-unsynced-recovery.json";
  anchor.href = url;
  anchor.click();
  URL.revokeObjectURL(url);
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.download = filename;
  anchor.href = url;
  anchor.click();
  URL.revokeObjectURL(url);
}

function persistenceStatus(
  state: Extract<BoardSyncState, { kind: "ready" }>,
): AppPersistenceStatus {
  if (state.quarantinedCount > 0) {
    return {
      detail:
        "Конфликтующие или устаревшие локальные изменения изолированы; остальные команды продолжают синхронизацию.",
      kind: "conflict",
      label: `Изолировано изменений · ${state.quarantinedCount}`,
    };
  }
  if (state.network === "offline") {
    return {
      detail: `${state.pendingCount} локальных команд ожидают подключения.`,
      kind: "scheduled",
      label:
        state.pendingCount === 0
          ? "Автономный режим"
          : `Автономно · в очереди ${state.pendingCount}`,
    };
  }
  if (state.pendingCount > 0) {
    return {
      detail: `Серверная ревизия ${state.revision}`,
      kind: "saving",
      label: `Синхронизация · ${state.pendingCount}`,
    };
  }
  return {
    detail: `Серверная ревизия ${state.revision}`,
    kind: "saved",
    label: `Синхронизировано · r${state.revision}`,
  };
}

function inverseStillApplies(
  document: BoardDocument,
  commands: readonly BoardCommand[],
): boolean {
  let preview = document;
  for (const command of commands) {
    const result = reduceBoardDocument(preview, command);
    if (!result.ok) return false;
    preview = result.document;
  }
  return true;
}

function terminalAccessRefreshFailure(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const status = (error as { readonly status?: unknown }).status;
  return status === 401 || status === 403 || status === 404 || status === 410;
}

export function SyncedApp({
  accessContext,
  documentId,
  geometryOsClient,
  lessonId,
  mathInkRecognizer,
  queue,
  refreshAccessContext,
  repository,
}: SyncedAppProps) {
  const [state, setState] = useState<BoardSyncState>({ kind: "bootstrapping" });
  const [collaborationStatus, setCollaborationStatus] =
    useState<BoardCollaborationStatus>("connecting");
  const [participants, setParticipants] = useState<readonly BoardPresence[]>(
    [],
  );
  const [inkPreviews, setInkPreviews] = useState<readonly BoardInkPreview[]>(
    [],
  );
  const [transformPreviews, setTransformPreviews] = useState<
    readonly BoardTransformPreview[]
  >([]);
  const [evidence, setEvidence] = useState<readonly BoardEvidenceDescriptor[]>(
    [],
  );
  const [evidenceStatus, setEvidenceStatus] = useState<string | null>(null);
  const [evidenceFinalizing, setEvidenceFinalizing] = useState(false);
  const [accessRefreshStatus, setAccessRefreshStatus] =
    useState<AccessRefreshStatus>("idle");
  const [currentAccessContext, setCurrentAccessContext] =
    useState(accessContext);
  const currentAccessContextRef = useRef(accessContext);
  const accessRefreshInFlightRef = useRef<Promise<void> | null>(null);
  const expectedAccessEpochRef = useRef<string | undefined>(undefined);
  const undoStackRef = useRef<readonly (readonly BoardCommand[])[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const renderedDocumentRef = useRef<BoardDocument | null>(null);
  const bootstrapStartedRef = useRef(0);
  const loadMeasuredRef = useRef(false);
  const previousCollaborationStatusRef =
    useRef<BoardCollaborationStatus>("connecting");
  const [originId] = useState(collaborationOriginId);
  const [engine] = useState(
    () =>
      new BoardSyncEngine({
        ...(accessContext === undefined ? {} : { accessContext }),
        createIdempotencyKey: () => `client:${crypto.randomUUID()}`,
        documentId,
        now: () => new Date().toISOString(),
        originId,
        onStateChange: setState,
        queue,
        repository,
      }),
  );
  const refreshStandaloneAccess = useCallback(
    (expectedAccessEpoch?: string): Promise<void> => {
      if (accessRefreshInFlightRef.current !== null) {
        return accessRefreshInFlightRef.current;
      }
      if (expectedAccessEpoch !== undefined) {
        expectedAccessEpochRef.current = expectedAccessEpoch;
      }
      engine.pauseForAccessRefresh();
      setAccessRefreshStatus("refreshing");
      setEvidenceStatus("Обновляем права доступа к доске…");

      const previousAccessEpoch = currentAccessContextRef.current?.accessEpoch;
      const requiredAccessEpoch = expectedAccessEpochRef.current;
      const refresh = (async () => {
        if (refreshAccessContext === undefined) {
          throw new Error("Обновление контекста доступа недоступно.");
        }
        const context = await refreshAccessContext();
        if (
          requiredAccessEpoch !== undefined &&
          previousAccessEpoch !== undefined &&
          requiredAccessEpoch !== previousAccessEpoch &&
          context.accessEpoch === previousAccessEpoch
        ) {
          throw new Error("Сервер вернул устаревший контекст доступа.");
        }
        await engine.updateAccessContext(context);
        currentAccessContextRef.current = context;
        setCurrentAccessContext(context);
        expectedAccessEpochRef.current = undefined;
        setAccessRefreshStatus("idle");
        setEvidenceStatus(
          context.capabilities.includes("board.write")
            ? "Права доступа обновлены."
            : "Права обновлены: доска доступна только для чтения.",
        );
      })()
        .catch((error: unknown) => {
          if (terminalAccessRefreshFailure(error)) {
            engine.dispose();
            setAccessRefreshStatus("revoked");
            setEvidenceStatus("Доступ к совместной доске отозван.");
          } else {
            setAccessRefreshStatus("failed");
            setEvidenceStatus(
              "Не удалось безопасно обновить права. Изменения заблокированы до повторной проверки.",
            );
          }
          throw error;
        })
        .finally(() => {
          accessRefreshInFlightRef.current = null;
        });
      accessRefreshInFlightRef.current = refresh;
      return refresh;
    },
    [engine, refreshAccessContext],
  );
  const handleAccessEvent = useCallback(
    (event: BoardAccessControlEvent) => {
      if (event.type === "access.revoked") {
        engine.dispose();
        setAccessRefreshStatus("revoked");
        setEvidenceStatus("Доступ к совместной доске отозван.");
        return;
      }
      return refreshStandaloneAccess(event.accessEpoch);
    },
    [engine, refreshStandaloneAccess],
  );
  const [collaboration] = useState(
    () =>
      new BoardCollaborationClient({
        documentId,
        onInkPreviews: setInkPreviews,
        onPresence: setParticipants,
        onRevision: () => void engine.synchronize(),
        onStatus: setCollaborationStatus,
        onTransformPreviews: setTransformPreviews,
        repository,
      }),
  );

  useEffect(() => {
    collaboration.setAccessEventHandler(handleAccessEvent);
    return () => collaboration.setAccessEventHandler(() => undefined);
  }, [collaboration, handleAccessEvent]);

  useEffect(() => {
    bootstrapStartedRef.current = performance.now();
    const bootstrap = async () => {
      if (lessonId !== undefined) {
        const context = await repository.context();
        if (context.role === "admin" || context.role === "tutor") {
          await repository.ensureBoard(lessonId, documentId, context.csrfToken);
        }
      }
      await engine.bootstrap();
    };
    void bootstrap().catch(() => void engine.bootstrap());
    const reconnect = () => void engine.setNetworkAvailable(true);
    const disconnect = () => void engine.setNetworkAvailable(false);
    window.addEventListener("online", reconnect);
    window.addEventListener("offline", disconnect);
    return () => {
      window.removeEventListener("online", reconnect);
      window.removeEventListener("offline", disconnect);
      engine.dispose();
    };
  }, [documentId, engine, lessonId, repository]);

  const ready = state.kind === "ready";
  const collaborationEnabled =
    state.kind === "ready" &&
    accessRefreshStatus === "idle" &&
    state.capabilities.includes("collaboration.connect");
  useEffect(() => {
    if (!ready) return;
    if (collaborationEnabled) collaboration.start();
    if (lessonId !== undefined && !loadMeasuredRef.current) {
      loadMeasuredRef.current = true;
      void repository
        .context()
        .then((context) =>
          repository.recordClientEvent(
            {
              durationMs: performance.now() - bootstrapStartedRef.current,
              name: "board.load",
              outcome: "success",
            },
            context.csrfToken,
          ),
        )
        .catch(() => undefined);
    }
    if (lessonId !== undefined) {
      void repository
        .listEvidence(lessonId)
        .then(setEvidence)
        .catch(() => setEvidence([]));
    }
    return () => collaboration.stop();
  }, [collaboration, collaborationEnabled, lessonId, ready, repository]);

  useEffect(() => {
    if (!ready || lessonId === undefined) return;
    const previous = previousCollaborationStatusRef.current;
    previousCollaborationStatusRef.current = collaborationStatus;
    if (previous === collaborationStatus) return;
    void repository
      .context()
      .then((context) =>
        repository.recordClientEvent(
          {
            name: "collaboration.connection",
            outcome:
              collaborationStatus === "online"
                ? previous === "offline"
                  ? "recovered"
                  : "success"
                : "offline",
          },
          context.csrfToken,
        ),
      )
      .catch(() => undefined);
  }, [collaborationStatus, lessonId, ready, repository]);

  useEffect(() => {
    if (state.kind !== "ready") return;
    const rendered = renderedDocumentRef.current;
    if (rendered === null) {
      renderedDocumentRef.current = state.document;
      return;
    }
    if (JSON.stringify(rendered) !== JSON.stringify(state.document)) {
      renderedDocumentRef.current = state.document;
      const applicable = undoStackRef.current.filter((commands) =>
        inverseStillApplies(state.document, commands),
      );
      undoStackRef.current = applicable;
      setUndoCount(applicable.length);
    }
  }, [state]);

  if (state.kind === "bootstrapping") {
    return (
      <main className="recovery-shell">
        <section aria-live="polite" className="recovery-card">
          <span aria-hidden="true" className="recovery-icon">
            ↻
          </span>
          <h1>Подключаем доску</h1>
          <p>Проверяем серверную ревизию и локальную очередь команд…</p>
        </section>
      </main>
    );
  }

  if (state.kind === "failure") {
    return (
      <main className="recovery-shell">
        <section className="recovery-card">
          <span aria-hidden="true" className="recovery-icon">
            !
          </span>
          <h1>Не удалось открыть доску</h1>
          <p role="alert">
            {state.code}: {state.message}
          </p>
          <button onClick={() => void engine.bootstrap()} type="button">
            Повторить подключение
          </button>
        </section>
      </main>
    );
  }

  if (state.kind === "recovery-required") {
    return (
      <main className="recovery-shell">
        <section className="recovery-card">
          <span aria-hidden="true" className="recovery-icon">
            ↺
          </span>
          <h1>Требуется восстановление синхронизации</h1>
          <p role="alert">
            {state.code}: {state.message}
          </p>
          <p>Неподтверждённых команд: {state.pendingCount}.</p>
          <div className="recovery-actions">
            {state.document === null ? null : (
              <button
                onClick={() => downloadRecovery(state.document!)}
                type="button"
              >
                Скачать локальную копию
              </button>
            )}
            <button onClick={() => void engine.bootstrap()} type="button">
              Повторить восстановление
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (collaborationStatus === "revoked" || accessRefreshStatus === "revoked") {
    return (
      <main className="recovery-shell">
        <section className="recovery-card">
          <span aria-hidden="true" className="recovery-icon">
            !
          </span>
          <h1>Доступ к доске недоступен</h1>
          <p role="alert">
            Доступ к совместной доске был отозван. Запросите новую ссылку у
            преподавателя.
          </p>
        </section>
      </main>
    );
  }

  const writeEnabled =
    accessRefreshStatus === "idle" &&
    state.capabilities.includes("board.write");
  const canManageEvidence =
    lessonId !== undefined &&
    (state.role === "admin" || state.role === "tutor");
  const principalLabel =
    state.principalType === "guest"
      ? `Ученик · ${currentAccessContext?.displayName ?? state.actorId}`
      : state.principalType === "teacher"
        ? `Преподаватель · ${currentAccessContext?.displayName ?? state.actorId}`
        : "Контекст занятия";

  const finalizeEvidence = async () => {
    if (
      lessonId === undefined ||
      !canFinalizeBoardEvidence(state) ||
      evidenceFinalizing
    ) {
      setEvidenceStatus(
        "Дождитесь подтверждения всех изменений сервером перед фиксацией итога.",
      );
      return;
    }
    const evidenceDocument = state.document;
    const evidenceRevision = state.revision;
    const evidenceSha256 = state.confirmedSha256;
    const started = performance.now();
    setEvidenceFinalizing(true);
    setEvidenceStatus("Фиксируем точную ревизию и создаём превью…");
    try {
      const context = await repository.context();
      const actualSha256 = await boardDocumentSha256(evidenceDocument);
      if (actualSha256 !== evidenceSha256) {
        throw new Error(
          "Документ изменился относительно подтверждённой серверной ревизии.",
        );
      }
      await repository.saveSnapshot(
        documentId,
        evidenceRevision,
        evidenceDocument,
        evidenceSha256,
        context.csrfToken,
      );
      const svg = renderBoardSnapshotSvg(evidenceDocument);
      const png = await renderBoardSnapshotPng(evidenceDocument);
      await repository.finalizeEvidence(
        documentId,
        evidenceRevision,
        evidenceSha256,
        svg,
        await blobBase64(png),
        [],
        context.csrfToken,
      );
      setEvidence(await repository.listEvidence(lessonId));
      setEvidenceStatus(`Итог ревизии ${evidenceRevision} зафиксирован.`);
      void repository
        .recordClientEvent(
          {
            durationMs: performance.now() - started,
            name: "evidence.finalize",
            outcome: "success",
          },
          context.csrfToken,
        )
        .catch(() => undefined);
    } catch (error) {
      setEvidenceStatus(
        error instanceof Error
          ? error.message
          : "Не удалось зафиксировать итог доски.",
      );
      void repository
        .context()
        .then((context) =>
          repository.recordClientEvent(
            {
              durationMs: performance.now() - started,
              name: "evidence.finalize",
              outcome: "failure",
            },
            context.csrfToken,
          ),
        )
        .catch(() => undefined);
    } finally {
      setEvidenceFinalizing(false);
    }
  };

  const setEvidencePublished = async (
    item: BoardEvidenceDescriptor,
    published: boolean,
  ) => {
    if (lessonId === undefined) return;
    setEvidenceStatus(
      published ? "Публикуем итог ученику…" : "Отзываем публикацию…",
    );
    try {
      const context = await repository.context();
      if (published) {
        await repository.publishEvidence(item.evidenceId, context.csrfToken);
      } else {
        await repository.revokeEvidence(item.evidenceId, context.csrfToken);
      }
      setEvidence(await repository.listEvidence(lessonId));
      setEvidenceStatus(
        published
          ? `Ревизия ${item.revision} опубликована.`
          : `Публикация ревизии ${item.revision} отозвана.`,
      );
    } catch (error) {
      setEvidenceStatus(
        error instanceof Error
          ? error.message
          : "Не удалось изменить публикацию итога.",
      );
    }
  };

  return (
    <div className="synced-workspace">
      <App
        collaborativeUndoAvailable={writeEnabled && undoCount > 0}
        commandActorId={state.actorId}
        geometryOsClient={geometryOsClient}
        historyEnabled={false}
        initialDocument={state.document}
        mathInkRecognizer={mathInkRecognizer}
        onCollaborativeUndo={() => {
          if (!writeEnabled) return;
          const inverse = undoStackRef.current.at(-1);
          if (inverse === undefined) return;
          undoStackRef.current = undoStackRef.current.slice(0, -1);
          setUndoCount(undoStackRef.current.length);
          void engine.apply(inverse);
        }}
        onCommandCommitted={(command, document, previousDocument) => {
          if (!writeEnabled) return;
          renderedDocumentRef.current = document;
          const inverse = invertOwnBoardCommand(command, previousDocument, {
            actorId: state.actorId,
            createId: () => `command:undo:${crypto.randomUUID()}`,
            now: () => new Date().toISOString(),
          });
          if (inverse.length > 0) {
            undoStackRef.current = [...undoStackRef.current, inverse].slice(
              -100,
            );
            setUndoCount(undoStackRef.current.length);
          }
          void engine.queue(command, document);
        }}
        onDocumentChange={(document) => {
          renderedDocumentRef.current = document;
        }}
        onPresenceChange={(presence) => collaboration.updatePresence(presence)}
        onInkPreviewChange={(preview) =>
          collaboration.updateInkPreview(preview)
        }
        onTransformPreviewChange={(preview) =>
          collaboration.updateTransformPreview(preview)
        }
        onExportPdfSnapshot={
          state.capabilities.includes("board.export")
            ? (document) => {
                setEvidenceStatus("Создаём PDF доски…");
                void renderBoardSnapshotPdf(document)
                  .then((blob) => {
                    downloadBlob("tutorboard-board.pdf", blob);
                    setEvidenceStatus("PDF доски сохранён.");
                  })
                  .catch(() =>
                    setEvidenceStatus("Не удалось создать PDF доски."),
                  );
              }
            : undefined
        }
        onShareBoard={
          lessonId === undefined
            ? undefined
            : () => {
                void copyBoardShareUrl(window.location)
                  .then(() => setEvidenceStatus("Ссылка на доску скопирована."))
                  .catch(() =>
                    setEvidenceStatus(
                      "Браузер не разрешил скопировать ссылку.",
                    ),
                  );
              }
        }
        persistenceNotice={
          accessRefreshStatus === "refreshing"
            ? "Права доступа обновляются. Редактирование временно приостановлено."
            : accessRefreshStatus === "failed"
              ? "Права доступа не подтверждены. Редактирование заблокировано."
              : state.network === "offline"
                ? "Изменения сохраняются локально и будут отправлены после восстановления связи."
                : null
        }
        persistenceStatus={persistenceStatus(state)}
        readOnly={!writeEnabled}
        standaloneMode={accessContext !== undefined}
        settingsExtra={
          <section className="board-settings-section">
            <h3>{lessonId === undefined ? "Совместная доска" : "Занятие"}</h3>
            <p>{principalLabel}</p>
            {accessRefreshStatus === "refreshing" ? (
              <p>Проверяем обновлённые права доступа…</p>
            ) : accessRefreshStatus === "failed" ? (
              <p>
                Права доступа не подтверждены.
                <button
                  onClick={() => {
                    void refreshStandaloneAccess()
                      .then(() => collaboration.start())
                      .catch(() => undefined);
                  }}
                  type="button"
                >
                  Повторить проверку прав
                </button>
              </p>
            ) : !writeEnabled ? (
              <p>Режим только для чтения</p>
            ) : null}
            <p>
              {collaborationStatus === "online"
                ? `В комнате ${participants.length + 1}`
                : collaborationStatus === "connecting"
                  ? "Подключение к комнате…"
                  : "Совместная работа офлайн"}
            </p>
            <p>
              Серверная ревизия {state.revision} · ожидают отправки{" "}
              {state.pendingCount} · изолировано {state.quarantinedCount}
            </p>
            {participants.length === 0 ? null : (
              <ul aria-label="Участники занятия">
                {participants.map((participant) => (
                  <li key={participant.clientId}>
                    {participant.displayName} · {participant.role}
                  </li>
                ))}
              </ul>
            )}
            {canManageEvidence ? (
              <button
                disabled={
                  !canFinalizeBoardEvidence(state) || evidenceFinalizing
                }
                onClick={() => void finalizeEvidence()}
                title={
                  canFinalizeBoardEvidence(state)
                    ? "Зафиксировать подтверждённую серверную ревизию"
                    : "Сначала синхронизируйте все локальные изменения"
                }
                type="button"
              >
                {evidenceFinalizing ? "Фиксируем…" : "Зафиксировать итог"}
              </button>
            ) : null}
            {evidence.length === 0 ? null : (
              <ul aria-label="Итоговые ревизии">
                {evidence.map((item) => {
                  const isPublished =
                    item.publishedAt !== null && item.revokedAt === null;
                  return (
                    <li key={item.evidenceId}>
                      <a
                        href={item.artifacts.svg}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Ревизия {item.revision}
                      </a>
                      <span>{isPublished ? " опубликована" : " черновик"}</span>
                      {canManageEvidence ? (
                        <button
                          onClick={() =>
                            void setEvidencePublished(item, !isPublished)
                          }
                          type="button"
                        >
                          {isPublished ? "Отозвать" : "Опубликовать"}
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
            {evidenceStatus === null ? null : (
              <span aria-live="polite">{evidenceStatus}</span>
            )}
          </section>
        }
        remoteCursors={participants.flatMap((participant) =>
          participant.cursor === null
            ? []
            : [{ actorId: participant.actorId, point: participant.cursor }],
        )}
        remoteInkPreviews={inkPreviews}
        remoteTransformPreviews={transformPreviews}
      />
    </div>
  );
}
