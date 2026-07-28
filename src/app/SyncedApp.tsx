import { useEffect, useRef, useState } from "react";

import type {
  BoardDocument,
  BoardSyncRepository,
  DocumentId,
  GeometryOsClient,
  PendingBoardCommandQueue,
} from "../core/public";
import {
  BoardSyncEngine,
  type BoardSyncState,
} from "../modules/server-sync/public";
import { App, type AppPersistenceStatus } from "./App";

interface SyncedAppProps {
  readonly documentId: DocumentId;
  readonly geometryOsClient?: GeometryOsClient | undefined;
  readonly lessonId: string;
  readonly queue: PendingBoardCommandQueue;
  readonly repository: BoardSyncRepository;
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
  queue,
  repository,
}: SyncedAppProps) {
  const [state, setState] = useState<BoardSyncState>({
    kind: "bootstrapping",
  });
  const [workspaceKey, setWorkspaceKey] = useState(0);
  const renderedDocumentRef = useRef<BoardDocument | null>(null);
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

  useEffect(() => {
    void engine.bootstrap();
    const reconnect = () => void engine.synchronize();
    window.addEventListener("online", reconnect);
    return () => window.removeEventListener("online", reconnect);
  }, [engine]);

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

  return (
    <App
      commandActorId={state.actorId}
      geometryOsClient={geometryOsClient}
      historyEnabled={false}
      initialDocument={state.document}
      key={workspaceKey}
      onCommandCommitted={(command, document) => {
        renderedDocumentRef.current = document;
        void engine.queue(command, document);
      }}
      onDocumentChange={(document) => {
        renderedDocumentRef.current = document;
      }}
      persistenceNotice={
        state.network === "offline"
          ? "Изменения сохраняются локально и будут отправлены после восстановления связи."
          : null
      }
      persistenceStatus={persistenceStatus(state)}
      readOnly={state.role === "parent"}
    />
  );
}
