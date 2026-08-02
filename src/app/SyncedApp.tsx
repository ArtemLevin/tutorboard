import { useEffect, useRef, useState } from "react";

import {
  BoardCollaborationClient,
  type BoardCollaborationStatus,
  type BoardPresence,
} from "../adapters/board-websocket/public";
import type {
  BoardDocument,
  BoardCommand,
  BoardEvidenceDescriptor,
  BoardPlatformRepository,
  DocumentId,
  GeometryOsClient,
  PendingBoardCommandQueue,
} from "../core/public";
import {
  boardDocumentSha256,
  BoardSyncEngine,
  invertOwnBoardCommand,
  type BoardSyncState,
} from "../modules/server-sync/public";
import {
  renderBoardSnapshotPng,
  renderBoardSnapshotSvg,
} from "../modules/document-transfer/public";
import type { MathInkRecognizer } from "../modules/handwritten-function/public";
import { App, type AppPersistenceStatus } from "./App";

interface SyncedAppProps {
  readonly documentId: DocumentId;
  readonly geometryOsClient?: GeometryOsClient | undefined;
  readonly lessonId: string;
  readonly mathInkRecognizer?: MathInkRecognizer | undefined;
  readonly queue: PendingBoardCommandQueue;
  readonly repository: BoardPlatformRepository;
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

function persistenceStatus(
  state: Extract<BoardSyncState, { kind: "ready" }>,
): AppPersistenceStatus {
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

export function SyncedApp({
  documentId,
  geometryOsClient,
  lessonId,
  mathInkRecognizer,
  queue,
  repository,
}: SyncedAppProps) {
  const [state, setState] = useState<BoardSyncState>({
    kind: "bootstrapping",
  });
  const [workspaceKey, setWorkspaceKey] = useState(0);
  const [collaborationStatus, setCollaborationStatus] =
    useState<BoardCollaborationStatus>("connecting");
  const [participants, setParticipants] = useState<readonly BoardPresence[]>(
    [],
  );
  const [evidence, setEvidence] = useState<readonly BoardEvidenceDescriptor[]>(
    [],
  );
  const [evidenceStatus, setEvidenceStatus] = useState<string | null>(null);
  const undoStackRef = useRef<readonly (readonly BoardCommand[])[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const renderedDocumentRef = useRef<BoardDocument | null>(null);
  const bootstrapStartedRef = useRef(0);
  const loadMeasuredRef = useRef(false);
  const previousCollaborationStatusRef =
    useRef<BoardCollaborationStatus>("connecting");
  const [engine] = useState(
    () =>
      new BoardSyncEngine({
        createIdempotencyKey: () => `client:${crypto.randomUUID()}`,
        documentId,
        lessonId,
        now: () => new Date().toISOString(),
        onStateChange: setState,
        queue,
        repository,
      }),
  );
  const [collaboration] = useState(
    () =>
      new BoardCollaborationClient({
        documentId,
        onPresence: setParticipants,
        onRevision: () => void engine.synchronize(),
        onStatus: setCollaborationStatus,
        repository,
      }),
  );

  useEffect(() => {
    bootstrapStartedRef.current = performance.now();
    void engine.bootstrap();
    const reconnect = () => void engine.synchronize();
    window.addEventListener("online", reconnect);
    return () => window.removeEventListener("online", reconnect);
  }, [engine]);
  const ready = state.kind === "ready";
  useEffect(() => {
    if (!ready) {
      return;
    }
    collaboration.start();
    if (!loadMeasuredRef.current) {
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
    void repository
      .listEvidence(lessonId)
      .then(setEvidence)
      .catch(() => setEvidence([]));
    return () => collaboration.stop();
  }, [collaboration, lessonId, ready, repository]);
  useEffect(() => {
    if (!ready) {
      return;
    }
    const previous = previousCollaborationStatusRef.current;
    previousCollaborationStatusRef.current = collaborationStatus;
    if (previous === collaborationStatus) {
      return;
    }
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
  }, [collaborationStatus, ready, repository]);

  useEffect(() => {
    if (state.kind !== "ready") {
      return;
    }
    const rendered = renderedDocumentRef.current;
    if (rendered === null) {
      renderedDocumentRef.current = state.document;
      return;
    }
    if (JSON.stringify(rendered) !== JSON.stringify(state.document)) {
      renderedDocumentRef.current = state.document;
      // A remote revision can invalidate the exact inverse of a local
      // operation. Fail closed instead of undoing through another actor's
      // subsequent work.
      undoStackRef.current = [];
      setUndoCount(0);
      setWorkspaceKey((current) => current + 1);
    }
  }, [state]);

  if (state.kind === "bootstrapping") {
    return (
      <main className="recovery-shell">
        <section aria-live="polite" className="recovery-card">
          <span aria-hidden="true" className="recovery-icon">
            ↻
          </span>
          <h1>Подключаем доску занятия</h1>
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

  const canManageEvidence = state.role === "admin" || state.role === "tutor";
  const finalizeEvidence = async () => {
    const started = performance.now();
    setEvidenceStatus("Фиксируем точную ревизию и создаём превью…");
    try {
      const context = await repository.context();
      const sha256 = await boardDocumentSha256(state.document);
      await repository.saveSnapshot(
        documentId,
        state.revision,
        state.document,
        sha256,
        context.csrfToken,
      );
      const svg = renderBoardSnapshotSvg(state.document);
      const png = await renderBoardSnapshotPng(state.document);
      await repository.finalizeEvidence(
        documentId,
        state.revision,
        sha256,
        svg,
        await blobBase64(png),
        [],
        context.csrfToken,
      );
      setEvidence(await repository.listEvidence(lessonId));
      setEvidenceStatus(`Итог ревизии ${state.revision} зафиксирован.`);
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
    }
  };
  const setEvidencePublished = async (
    item: BoardEvidenceDescriptor,
    published: boolean,
  ) => {
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
      <aside
        aria-label="Совместная работа и итоги"
        className="collaboration-bar"
      >
        <div>
          <strong>
            {collaborationStatus === "online"
              ? `В комнате ${participants.length + 1}`
              : collaborationStatus === "connecting"
                ? "Подключение к комнате…"
                : "Совместная работа офлайн"}
          </strong>
          <span>Команды подтверждаются серверными ревизиями.</span>
        </div>
        {participants.length === 0 ? null : (
          <ul aria-label="Участники занятия">
            {participants.map((participant) => (
              <li key={participant.clientId}>
                {participant.actorId} · {participant.role}
              </li>
            ))}
          </ul>
        )}
        {canManageEvidence ? (
          <button onClick={() => void finalizeEvidence()} type="button">
            Зафиксировать итог
          </button>
        ) : null}
        {evidence.length === 0 ? null : (
          <ul aria-label="Итоговые ревизии">
            {evidence.map((item) => {
              const isPublished =
                item.publishedAt !== null && item.revokedAt === null;
              return (
                <li key={item.evidenceId}>
                  <a href={item.artifacts.svg} rel="noreferrer" target="_blank">
                    Ревизия {item.revision}
                  </a>
                  <span>{isPublished ? "опубликована" : "черновик"}</span>
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
      </aside>
      <App
        collaborativeUndoAvailable={undoCount > 0}
        commandActorId={state.actorId}
        geometryOsClient={geometryOsClient}
        historyEnabled={false}
        initialDocument={state.document}
        key={workspaceKey}
        mathInkRecognizer={mathInkRecognizer}
        onCollaborativeUndo={() => {
          const inverse = undoStackRef.current.at(-1);
          if (inverse === undefined) {
            return;
          }
          undoStackRef.current = undoStackRef.current.slice(0, -1);
          setUndoCount(undoStackRef.current.length);
          void engine.apply(inverse);
        }}
        onCommandCommitted={(command, document, previousDocument) => {
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
        persistenceNotice={
          state.network === "offline"
            ? "Изменения сохраняются локально и будут отправлены после восстановления связи."
            : null
        }
        persistenceStatus={persistenceStatus(state)}
        readOnly={state.role === "parent"}
        remoteCursors={participants.flatMap((participant) =>
          participant.cursor === null
            ? []
            : [{ actorId: participant.actorId, point: participant.cursor }],
        )}
      />
    </div>
  );
}
