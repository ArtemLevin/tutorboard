import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createBoardDocumentWorkerComputation } from "../adapters/board-document-worker/public";
import {
  BoardMediaResourceScope,
  BoardMediaResourceScopeContext,
  type BoardMediaResourceContextValue,
} from "../adapters/canvas-konva/public";
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
  type BoardDocumentComputation,
  type BoardEvidenceDescriptor,
  type DocumentId,
  type GeometryOsClient,
  type MediaAssetObject,
  type PendingBoardCommandQueue,
} from "../core/public";
import type {
  BoardCollaborationRepository,
  BoardEvidenceRepository,
  BoardMediaRepository,
  BoardSyncRepository,
  BoardTelemetryRepository,
  LegacyBoardLifecycleRepository,
} from "../core/ports/public";
import {
  BoardSyncEngine,
  invertOwnBoardCommand,
  type BoardSyncState,
} from "../modules/server-sync/public";
import {
  embedBoardMediaForSnapshot,
  renderBoardSnapshotPng,
  renderBoardSnapshotPdf,
  renderBoardSnapshotSvg,
} from "../modules/document-transfer/public";
import type { MathInkRecognizer } from "../modules/handwritten-function/public";
import { App, type AppPersistenceStatus } from "./App";
import type { BoardMediaUploadSession } from "./media-asset-import";
import { copyBoardShareUrl } from "./board-chrome/board-share";
import { canFinalizeBoardEvidence } from "./synced-evidence";

type SyncedBoardRepository = BoardCollaborationRepository &
  BoardEvidenceRepository &
  BoardSyncRepository &
  BoardTelemetryRepository &
  LegacyBoardLifecycleRepository &
  Partial<BoardMediaRepository>;

interface SyncedAppProps {
  readonly mediaAssetImportEnabled?: boolean | undefined;
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

// Each effect setup owns a fresh engine. React StrictMode may clean up a
// setup immediately; a disposed instance must never be used by its successor.
export function SyncedApp(props: SyncedAppProps) {
  const [state, setState] = useState<BoardSyncState>({ kind: "bootstrapping" });
  const [runtime, setRuntime] = useState<{
    documentComputation: BoardDocumentComputation;
    engine: BoardSyncEngine;
    key: string;
    documentId: DocumentId;
    queue: PendingBoardCommandQueue;
    repository: SyncedBoardRepository;
    accessContext: BoardRuntimeAccessContext | undefined;
  } | null>(null);
  const { accessContext, documentId, queue, repository } = props;
  useEffect(() => {
    let active = true;
    const documentComputation = createBoardDocumentWorkerComputation();
    const engine = new BoardSyncEngine({
      ...(accessContext === undefined ? {} : { accessContext }),
      createIdempotencyKey: () => `client:${crypto.randomUUID()}`,
      documentComputation,
      documentId,
      now: () => new Date().toISOString(),
      originId: collaborationOriginId(),
      onStateChange: (next) => {
        if (active) setState(next);
      },
      queue,
      repository,
    });
    // Publish only a setup that survived immediate StrictMode cleanup.
    queueMicrotask(() => {
      if (!active) return;
      setState({ kind: "bootstrapping" });
      setRuntime({
        documentComputation,
        engine,
        key: crypto.randomUUID(),
        documentId,
        queue,
        repository,
        accessContext,
      });
    });
    return () => {
      active = false;
      engine.dispose();
      documentComputation.dispose();
    };
  }, [accessContext, documentId, queue, repository]);
  if (
    runtime === null ||
    runtime.documentId !== documentId ||
    runtime.queue !== queue ||
    runtime.repository !== repository ||
    runtime.accessContext !== accessContext
  )
    return null;
  return (
    <SyncedWorkspace
      {...props}
      documentComputation={runtime.documentComputation}
      engine={runtime.engine}
      key={runtime.key}
      state={state}
    />
  );
}

function SyncedWorkspace({
  accessContext,
  documentComputation,
  documentId,
  engine,
  state,
  geometryOsClient,
  lessonId,
  mathInkRecognizer,
  mediaAssetImportEnabled = false,
  refreshAccessContext,
  repository,
}: SyncedAppProps & {
  readonly documentComputation: BoardDocumentComputation;
  readonly engine: BoardSyncEngine;
  readonly state: BoardSyncState;
}) {
  const [collaborationStatus, setCollaborationStatus] =
    useState<BoardCollaborationStatus>("connecting");
  const [collaborationAccessReady, setCollaborationAccessReady] =
    useState(false);
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
  const accessRefreshInFlightRef = useRef<Promise<BoardAccessContext> | null>(
    null,
  );
  const expectedAccessEpochRef = useRef<string | undefined>(undefined);
  const undoStackRef = useRef<readonly (readonly BoardCommand[])[]>([]);
  const [undoCount, setUndoCount] = useState(0);
  const renderedDocumentRef = useRef<BoardDocument | null>(null);
  const bootstrapStartedRef = useRef(0);
  const loadMeasuredRef = useRef(false);
  const previousCollaborationStatusRef =
    useRef<BoardCollaborationStatus>("connecting");
  const previousMediaConnectionStatusRef =
    useRef<BoardCollaborationStatus>("connecting");
  const refreshAccessAfterCollaborationOfflineRef = useRef(false);
  const mediaImportEpochRef = useRef(0);
  const activeRef = useRef(false);
  const mediaScopeRef = useRef<BoardMediaResourceScope | null>(null);
  const [mediaResources, setMediaResources] =
    useState<BoardMediaResourceContextValue | null>(null);

  // A fresh scope belongs to each effect setup, including StrictMode remounts.
  useEffect(() => {
    let active = true;
    const scope = new BoardMediaResourceScope(String(documentId));
    mediaScopeRef.current = scope;
    queueMicrotask(() => {
      if (active) {
        setMediaResources({
          scope,
          resourceGeneration: scope.identity.resourceGeneration,
          enabled: true,
        });
      }
    });
    return () => {
      active = false;
      scope.dispose();
      if (mediaScopeRef.current === scope) mediaScopeRef.current = null;
    };
  }, [documentId]);

  const invalidateMedia = useCallback((enabled: boolean) => {
    const scope = mediaScopeRef.current;
    if (scope === null || scope.snapshot().disposed) return;
    scope.invalidate();
    setMediaResources({
      scope,
      resourceGeneration: scope.identity.resourceGeneration,
      enabled,
    });
  }, []);

  const revokeMedia = useCallback(() => {
    const scope = mediaScopeRef.current;
    if (scope === null || scope.snapshot().disposed) return;
    scope.dispose();
    setMediaResources({
      scope,
      resourceGeneration: scope.identity.resourceGeneration,
      enabled: false,
    });
  }, []);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);
  const refreshStandaloneAccess = useCallback(
    (expectedAccessEpoch?: string): Promise<BoardAccessContext> => {
      if (accessRefreshInFlightRef.current !== null) {
        return accessRefreshInFlightRef.current;
      }
      if (expectedAccessEpoch !== undefined) {
        expectedAccessEpochRef.current = expectedAccessEpoch;
      }
      mediaImportEpochRef.current += 1;
      invalidateMedia(false);
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
        if (!activeRef.current) throw new Error("Board workspace was closed.");
        if (
          requiredAccessEpoch !== undefined &&
          previousAccessEpoch !== undefined &&
          requiredAccessEpoch !== previousAccessEpoch &&
          context.accessEpoch === previousAccessEpoch
        ) {
          throw new Error("Сервер вернул устаревший контекст доступа.");
        }
        if (context.boardId !== documentId) {
          throw new Error("Сервер вернул права доступа к другой доске.");
        }
        await engine.updateAccessContext(context);
        if (!activeRef.current) throw new Error("Board workspace was closed.");
        currentAccessContextRef.current = context;
        invalidateMedia(context.capabilities.includes("board.read"));
        setCurrentAccessContext(context);
        expectedAccessEpochRef.current = undefined;
        setAccessRefreshStatus("idle");
        setEvidenceStatus(
          context.capabilities.includes("board.write")
            ? "Права доступа обновлены."
            : "Права обновлены: доска доступна только для чтения.",
        );
        return context;
      })()
        .catch((error: unknown) => {
          if (!activeRef.current) throw error;
          if (terminalAccessRefreshFailure(error)) {
            revokeMedia();
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
    [documentId, engine, invalidateMedia, refreshAccessContext, revokeMedia],
  );
  const handleAccessEvent = useCallback(
    (event: BoardAccessControlEvent) => {
      if (event.type === "access.revoked") {
        mediaImportEpochRef.current += 1;
        revokeMedia();
        engine.dispose();
        setAccessRefreshStatus("revoked");
        setEvidenceStatus("Доступ к совместной доске отозван.");
        return false;
      }
      return refreshStandaloneAccess(event.accessEpoch).then((context) =>
        context.capabilities.includes("collaboration.connect"),
      );
    },
    [engine, refreshStandaloneAccess, revokeMedia],
  );
  const [collaboration] = useState(
    () =>
      new BoardCollaborationClient({
        documentId,
        onInkPreviews: setInkPreviews,
        onPresence: setParticipants,
        onRevision: () => void engine.synchronize(),
        onStatus: (status) => {
          if (status !== "online") setCollaborationAccessReady(false);
          setCollaborationStatus(status);
        },
        onTransformPreviews: setTransformPreviews,
        repository,
      }),
  );

  useEffect(() => {
    if (collaborationStatus === "revoked") revokeMedia();
  }, [collaborationStatus, revokeMedia]);

  useEffect(() => {
    if (accessContext === undefined) return;
    if (
      collaborationStatus === "offline" &&
      previousMediaConnectionStatusRef.current !== "offline"
    ) {
      invalidateMedia(false);
    }
    previousMediaConnectionStatusRef.current = collaborationStatus;
  }, [accessContext, collaborationStatus, invalidateMedia]);

  useEffect(() => {
    collaboration.setAccessEventHandler(handleAccessEvent);
    collaboration.setAccessRefreshHandler(
      refreshAccessContext === undefined
        ? undefined
        : async () => {
            const context = await refreshStandaloneAccess();
            return context.capabilities.includes("collaboration.connect");
          },
    );
    return () => {
      collaboration.setAccessEventHandler(() => undefined);
      collaboration.setAccessRefreshHandler(undefined);
    };
  }, [
    collaboration,
    handleAccessEvent,
    refreshAccessContext,
    refreshStandaloneAccess,
  ]);

  useEffect(() => {
    if (collaborationStatus === "offline") {
      refreshAccessAfterCollaborationOfflineRef.current = true;
      return;
    }
    if (collaborationStatus !== "online") {
      return;
    }
    if (
      !refreshAccessAfterCollaborationOfflineRef.current ||
      refreshAccessContext === undefined
    ) {
      if (
        refreshAccessAfterCollaborationOfflineRef.current &&
        refreshAccessContext === undefined &&
        accessContext !== undefined
      ) {
        invalidateMedia(true);
      }
      refreshAccessAfterCollaborationOfflineRef.current = false;
      setCollaborationAccessReady(true);
      return;
    }
    refreshAccessAfterCollaborationOfflineRef.current = false;
    const previousAccessEpoch = currentAccessContextRef.current?.accessEpoch;
    void refreshStandaloneAccess()
      .then((context) => {
        if (
          previousAccessEpoch !== undefined &&
          context.accessEpoch !== previousAccessEpoch
        ) {
          if (!activeRef.current) return;
          collaboration.stop();
          collaboration.start();
          return;
        }
        setCollaborationAccessReady(true);
      })
      .catch(() => setCollaborationAccessReady(false));
  }, [
    accessContext,
    collaboration,
    collaborationStatus,
    invalidateMedia,
    refreshAccessContext,
    refreshStandaloneAccess,
  ]);

  useEffect(() => {
    let active = true;
    bootstrapStartedRef.current = performance.now();
    const bootstrap = async () => {
      if (!active) return;
      if (lessonId !== undefined) {
        const context = await repository.context();
        if (!active) return;
        if (context.role === "admin" || context.role === "tutor") {
          await repository.ensureBoard(lessonId, documentId, context.csrfToken);
        }
      }
      if (active) await engine.bootstrap();
    };
    void Promise.resolve()
      .then(bootstrap)
      .catch(() => {
        if (active) void engine.bootstrap();
      });
    const reconnect = () => {
      if (refreshAccessContext === undefined) {
        void engine.setNetworkAvailable(true).then(() => {
          if (!activeRef.current) return;
          collaboration.stop();
          collaboration.start();
        });
        return;
      }
      void refreshStandaloneAccess()
        .then(() => engine.setNetworkAvailable(true))
        .then(() => {
          if (!activeRef.current) return;
          collaboration.stop();
          collaboration.start();
        })
        .catch(() => undefined);
    };
    const disconnect = () => void engine.setNetworkAvailable(false);
    window.addEventListener("online", reconnect);
    window.addEventListener("offline", disconnect);
    return () => {
      active = false;
      window.removeEventListener("online", reconnect);
      window.removeEventListener("offline", disconnect);
    };
  }, [
    documentId,
    collaboration,
    engine,
    lessonId,
    refreshAccessContext,
    refreshStandaloneAccess,
    repository,
  ]);

  const resolveContentSource = repository.resolveMediaContentSource;
  const mediaAssetSourceResolver = useMemo(
    () =>
      resolveContentSource === undefined ||
      mediaResources === null ||
      !mediaResources.enabled
        ? undefined
        : (asset: MediaAssetObject) => {
            if (
              mediaResources.scope.snapshot().disposed ||
              mediaResources.scope.identity.resourceGeneration !==
                mediaResources.resourceGeneration ||
              accessRefreshInFlightRef.current !== null ||
              currentAccessContextRef.current !== currentAccessContext
            ) {
              throw new Error("Board media access context has changed.");
            }
            return resolveContentSource(documentId, asset);
          },
    [documentId, currentAccessContext, mediaResources, resolveContentSource],
  );

  const prepareExportSnapshot = async (
    document: BoardDocument,
  ): Promise<BoardDocument> => {
    const context = currentAccessContextRef.current;
    const mediaAccessEpoch = mediaImportEpochRef.current;
    const resolved = await embedBoardMediaForSnapshot(
      document,
      mediaAssetSourceResolver === undefined
        ? undefined
        : (asset) => mediaAssetSourceResolver(asset).loadBlob(),
    );
    if (
      !activeRef.current ||
      currentAccessContextRef.current !== context ||
      mediaImportEpochRef.current !== mediaAccessEpoch ||
      accessRefreshInFlightRef.current !== null ||
      accessRefreshStatus !== "idle"
    ) {
      throw new Error("Права доступа изменились во время подготовки снимка.");
    }
    return resolved;
  };

  const exportSnapshot = async (
    document: BoardDocument,
    kind: "pdf" | "png" | "svg",
  ): Promise<void> => {
    setEvidenceStatus("Подготавливаем изображения доски для экспорта…");
    try {
      const resolved = await prepareExportSnapshot(document);
      if (kind === "svg") {
        downloadBlob(
          "tutorboard-snapshot.svg",
          new Blob([renderBoardSnapshotSvg(resolved)], {
            type: "image/svg+xml",
          }),
        );
      } else if (kind === "png") {
        downloadBlob(
          "tutorboard-snapshot.png",
          await renderBoardSnapshotPng(resolved),
        );
      } else {
        downloadBlob(
          "tutorboard-board.pdf",
          await renderBoardSnapshotPdf(resolved),
        );
      }
      setEvidenceStatus("Снимок доски сохранён.");
    } catch (error) {
      setEvidenceStatus(
        error instanceof Error
          ? error.message
          : "Не удалось создать снимок доски.",
      );
    }
  };

  const ready = state.kind === "ready";
  const collaborationEnabled =
    state.kind === "ready" &&
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

  const writeEnabled =
    state.kind === "ready" &&
    accessRefreshStatus === "idle" &&
    (accessContext === undefined || collaborationAccessReady) &&
    state.capabilities.includes("board.write");
  const mediaUploadSession = useMemo<
    BoardMediaUploadSession | undefined
  >(() => {
    if (
      !mediaAssetImportEnabled ||
      !writeEnabled ||
      repository.uploadMedia === undefined
    )
      return undefined;
    const uploadMedia = repository.uploadMedia;
    const epoch = mediaImportEpochRef.current;
    return {
      documentId,
      uploadMedia,
      isCurrent: () =>
        activeRef.current &&
        mediaImportEpochRef.current === epoch &&
        (accessContext === undefined ||
          currentAccessContextRef.current === currentAccessContext) &&
        accessRefreshInFlightRef.current === null &&
        window.navigator.onLine,
      getCsrfToken: async () => {
        if (accessContext !== undefined) {
          const context = currentAccessContextRef.current;
          if (context === undefined || context !== currentAccessContext)
            throw new Error("Права доступа изменились.");
          return context.csrfToken;
        }
        const context = await repository.context();
        return context.csrfToken;
      },
    };
  }, [
    accessContext,
    currentAccessContext,
    documentId,
    mediaAssetImportEnabled,
    repository,
    writeEnabled,
  ]);

  if (mediaResources === null) return null;

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
      const hash = await documentComputation.sha256(evidenceDocument);
      if (!hash.ok) {
        throw new Error("Документ не прошёл проверку перед фиксацией ревизии.");
      }
      const actualSha256 = hash.sha256;
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
      const resolvedEvidence = await prepareExportSnapshot(evidenceDocument);
      const svg = renderBoardSnapshotSvg(resolvedEvidence);
      const png = await renderBoardSnapshotPng(resolvedEvidence);
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
    <BoardMediaResourceScopeContext.Provider value={mediaResources}>
      <div className="synced-workspace">
        <App
          collaborativeUndoAvailable={writeEnabled && undoCount > 0}
          commandActorId={state.actorId}
          geometryOsClient={geometryOsClient}
          historyEnabled={false}
          initialDocument={state.document}
          mathInkRecognizer={mathInkRecognizer}
          mediaAssetSourceResolver={mediaAssetSourceResolver}
          mediaResourceGeneration={mediaResources.resourceGeneration}
          mediaAssetImportEnabled={mediaAssetImportEnabled}
          mediaUploadSession={mediaUploadSession}
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
          onCommandsCommitted={(commands, document, previousDocument) => {
            if (!writeEnabled || commands.length === 0) return;
            renderedDocumentRef.current = document;
            let preview = previousDocument;
            const inverseGroups: (readonly BoardCommand[])[] = [];
            for (const command of commands) {
              const inverse = invertOwnBoardCommand(command, preview, {
                actorId: state.actorId,
                createId: () => `command:undo:${crypto.randomUUID()}`,
                now: () => new Date().toISOString(),
              });
              const result = reduceBoardDocument(preview, command);
              if (!result.ok) return;
              preview = result.document;
              inverseGroups.unshift(inverse);
            }
            const inverse = inverseGroups.flat();
            if (inverse.length > 0) {
              undoStackRef.current = [...undoStackRef.current, inverse].slice(
                -100,
              );
              setUndoCount(undoStackRef.current.length);
            }
            void engine.queueBatch(commands, document);
          }}
          onDocumentChange={(document) => {
            renderedDocumentRef.current = document;
          }}
          onPresenceChange={(presence) =>
            collaboration.updatePresence(presence)
          }
          onInkPreviewChange={(preview) =>
            collaboration.updateInkPreview(preview)
          }
          onTransformPreviewChange={(preview) =>
            collaboration.updateTransformPreview(preview)
          }
          onExportPdfSnapshot={
            state.capabilities.includes("board.export")
              ? (document) => void exportSnapshot(document, "pdf")
              : undefined
          }
          onExportPngSnapshot={
            state.capabilities.includes("board.export")
              ? (document) => void exportSnapshot(document, "png")
              : undefined
          }
          onExportSvgSnapshot={
            state.capabilities.includes("board.export")
              ? (document) => void exportSnapshot(document, "svg")
              : undefined
          }
          onShareBoard={
            lessonId === undefined
              ? undefined
              : () => {
                  void copyBoardShareUrl(window.location)
                    .then(() =>
                      setEvidenceStatus("Ссылка на доску скопирована."),
                    )
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
                {collaborationStatus === "online" && collaborationAccessReady
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
                        <span>
                          {isPublished ? " опубликована" : " черновик"}
                        </span>
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
    </BoardMediaResourceScopeContext.Provider>
  );
}
