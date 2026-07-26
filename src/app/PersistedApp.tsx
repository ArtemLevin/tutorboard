import { useCallback, useEffect, useRef, useState } from "react";

import {
  documentId,
  persistenceOperationId,
  type BoardDocument,
  type BoardDocumentRepository,
  type DocumentId,
  type GeometryOsClient,
  type LocalRevisionId,
} from "../core/public";
import {
  exportTutorBoardDocument,
  renderBoardSnapshotPng,
  renderBoardSnapshotSvg,
} from "../modules/document-transfer/public";
import {
  importLocalDocumentJson,
  LocalDocumentAutosave,
  type LocalAutosaveState,
} from "../modules/local-persistence/public";
import { validateStoredSvgDocument } from "../modules/svg-import/public";
import { App, createInitialDocument, type AppPersistenceStatus } from "./App";

const localDocumentId = documentId("document:local-board");

interface PersistedAppProps {
  readonly geometryOsClient: GeometryOsClient;
  readonly repository: BoardDocumentRepository;
}

type BootstrapState =
  | { readonly kind: "loading" }
  | {
      readonly document: BoardDocument;
      readonly initialRevisionId: LocalRevisionId | null;
      readonly kind: "ready";
      readonly notice: string | null;
      readonly persistedDocument: BoardDocument | null;
    }
  | {
      readonly currentRevisionId: LocalRevisionId | null;
      readonly kind: "recovery-required";
    }
  | {
      readonly code: string;
      readonly kind: "failure";
      readonly message: string;
    };

function downloadJson(filename: string, value: unknown): void {
  downloadText(filename, JSON.stringify(value, null, 2), "application/json");
}

function downloadText(
  filename: string,
  value: string,
  mediaType: string,
): void {
  const blob = new Blob([value], { type: mediaType });
  downloadBlob(filename, blob);
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = window.document.createElement("a");
  anchor.download = filename;
  anchor.href = url;
  anchor.click();
  URL.revokeObjectURL(url);
}

function statusView(state: LocalAutosaveState): AppPersistenceStatus {
  switch (state.kind) {
    case "idle":
      return { kind: "idle", label: "Локальное сохранение" };
    case "scheduled":
      return { kind: "scheduled", label: "Ожидает сохранения" };
    case "saving":
      return { kind: "saving", label: "Сохранение…" };
    case "saved":
      return {
        kind: "saved",
        label: state.duplicate ? "Сохранено повторно" : "Сохранено локально",
      };
    case "error":
      return {
        detail: `${state.code}: ${state.message}`,
        kind: "error",
        label: "Не удалось сохранить документ",
        retryable: state.retryable,
      };
    case "conflict":
      return {
        detail:
          "Локальная ревизия изменилась в другой вкладке. Экспортируйте диагностику и перезагрузите страницу.",
        kind: "conflict",
        label: "Конфликт локальных ревизий",
      };
  }
}

interface WorkspaceProps {
  readonly document: BoardDocument;
  readonly initialRevisionId: LocalRevisionId | null;
  readonly notice: string | null;
  readonly persistedDocument: BoardDocument | null;
  readonly repository: BoardDocumentRepository;
  readonly geometryOsClient: GeometryOsClient;
}

function PersistedWorkspace({
  document: initialDocument,
  initialRevisionId,
  notice,
  persistedDocument,
  repository,
  geometryOsClient,
}: WorkspaceProps) {
  const [activeDocument, setActiveDocument] = useState(initialDocument);
  const [autosaveState, setAutosaveState] = useState<LocalAutosaveState>({
    kind: "idle",
  });
  const [importError, setImportError] = useState<string | null>(null);
  const [workspaceKey, setWorkspaceKey] = useState(0);
  const autosaveRef = useRef<LocalDocumentAutosave | null>(null);
  if (autosaveRef.current === null) {
    autosaveRef.current = new LocalDocumentAutosave({
      createOperationId: () =>
        persistenceOperationId(`save:${crypto.randomUUID()}`),
      initialDocument: persistedDocument,
      initialRevisionId,
      now: () => new Date().toISOString(),
      onStateChange: setAutosaveState,
      repository,
    });
  }

  useEffect(() => {
    const autosave = autosaveRef.current;
    return () => autosave?.dispose();
  }, []);

  const exportDiagnostics = useCallback(async () => {
    const bundle = await repository.diagnose(
      localDocumentId,
      new Date().toISOString(),
    );
    downloadJson("tutorboard-local-diagnostics.json", bundle);
  }, [repository]);

  const exportDocument = useCallback((document: BoardDocument) => {
    const exported = exportTutorBoardDocument(document);
    if (exported.status === "error") {
      setImportError(`${exported.code}: ${exported.message}`);
      return;
    }
    setImportError(null);
    downloadText(exported.filename, exported.json, exported.mediaType);
  }, []);

  const exportSnapshot = useCallback((document: BoardDocument) => {
    downloadText(
      "tutorboard-snapshot.svg",
      renderBoardSnapshotSvg(document),
      "image/svg+xml",
    );
  }, []);

  const exportPngSnapshot = useCallback(async (document: BoardDocument) => {
    try {
      downloadBlob(
        "tutorboard-snapshot.png",
        await renderBoardSnapshotPng(document),
      );
      setImportError(null);
    } catch {
      setImportError(
        "document-export.png-failed: не удалось создать PNG-снимок.",
      );
    }
  }, []);

  const importDocument = useCallback(async (file: File) => {
    const imported = importLocalDocumentJson(
      await file.text(),
      localDocumentId,
    );
    if (imported.status === "error") {
      setImportError(imported.message);
      return;
    }
    const svgValidation = validateStoredSvgDocument(imported.document);
    if (svgValidation.status === "error") {
      setImportError(
        `${svgValidation.diagnostic.code}: импорт содержит несовместимый SVG-объект.`,
      );
      return;
    }
    setImportError(null);
    setActiveDocument(imported.document);
    setWorkspaceKey((current) => current + 1);
  }, []);
  const handleDocumentChange = useCallback((document: BoardDocument) => {
    autosaveRef.current?.schedule(document);
  }, []);

  return (
    <App
      geometryOsClient={geometryOsClient}
      initialDocument={activeDocument}
      key={workspaceKey}
      onDocumentChange={handleDocumentChange}
      onExportDocument={exportDocument}
      onExportDiagnostics={() => void exportDiagnostics()}
      onExportPngSnapshot={(document) => void exportPngSnapshot(document)}
      onExportSvgSnapshot={exportSnapshot}
      onImportDocument={(file) => void importDocument(file)}
      onRetryPersistence={() => autosaveRef.current?.retry()}
      persistenceNotice={importError ?? notice}
      persistenceStatus={statusView(autosaveState)}
    />
  );
}

interface RecoveryScreenProps {
  readonly currentRevisionId: LocalRevisionId | null;
  readonly documentId: DocumentId;
  readonly onContinue: (
    document: BoardDocument,
    currentRevisionId: LocalRevisionId | null,
  ) => void;
  readonly repository: BoardDocumentRepository;
}

function RecoveryScreen({
  currentRevisionId,
  documentId: expectedDocumentId,
  onContinue,
  repository,
}: RecoveryScreenProps) {
  const [error, setError] = useState<string | null>(null);

  const exportDiagnostics = async () => {
    const bundle = await repository.diagnose(
      expectedDocumentId,
      new Date().toISOString(),
    );
    downloadJson("tutorboard-recovery-diagnostics.json", bundle);
  };

  const importDocument = async (file: File) => {
    const result = importLocalDocumentJson(
      await file.text(),
      expectedDocumentId,
    );
    if (result.status === "error") {
      setError(result.message);
      return;
    }
    const svgValidation = validateStoredSvgDocument(result.document);
    if (svgValidation.status === "error") {
      setError(
        `${svgValidation.diagnostic.code}: импорт содержит несовместимый SVG-объект.`,
      );
      return;
    }
    onContinue(result.document, currentRevisionId);
  };

  return (
    <main className="recovery-shell">
      <section aria-labelledby="recovery-title" className="recovery-card">
        <span className="recovery-icon" aria-hidden="true">
          ↺
        </span>
        <h1 id="recovery-title">Требуется восстановление доски</h1>
        <p>
          Последняя локальная ревизия повреждена или несовместима. Исходные
          данные сохранены и не будут удалены автоматически.
        </p>
        {error === null ? null : <p role="alert">{error}</p>}
        <div className="recovery-actions">
          <button onClick={() => void exportDiagnostics()} type="button">
            Скачать диагностику
          </button>
          <label>
            Импортировать JSON
            <input
              accept="application/json,.json"
              aria-label="Импорт JSON для восстановления"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file !== undefined) {
                  void importDocument(file);
                }
              }}
              type="file"
            />
          </label>
          <button
            onClick={() =>
              onContinue(createInitialDocument(), currentRevisionId)
            }
            type="button"
          >
            Открыть чистую доску
          </button>
        </div>
      </section>
    </main>
  );
}

export function PersistedApp({
  geometryOsClient,
  repository,
}: PersistedAppProps) {
  const [bootstrap, setBootstrap] = useState<BootstrapState>({
    kind: "loading",
  });

  useEffect(() => {
    let cancelled = false;
    void repository.load(localDocumentId).then((result) => {
      if (cancelled) {
        return;
      }
      if (result.status === "empty") {
        setBootstrap({
          document: createInitialDocument(),
          initialRevisionId: null,
          kind: "ready",
          notice: null,
          persistedDocument: null,
        });
      } else if (
        result.status === "restored" ||
        result.status === "recovered"
      ) {
        const svgValidation = validateStoredSvgDocument(result.document);
        if (svgValidation.status === "error") {
          setBootstrap({
            currentRevisionId: result.revisionId,
            kind: "recovery-required",
          });
          return;
        }
        setBootstrap({
          document: result.document,
          initialRevisionId: result.revisionId,
          kind: "ready",
          notice:
            result.status === "recovered"
              ? "Повреждённая ревизия сохранена для диагностики. Открыта последняя корректная версия."
              : null,
          persistedDocument: result.document,
        });
      } else if (result.status === "recovery-required") {
        setBootstrap({
          currentRevisionId: result.currentRevisionId,
          kind: "recovery-required",
        });
      } else {
        setBootstrap({
          code: result.code,
          kind: "failure",
          message: result.message,
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [repository]);

  if (bootstrap.kind === "loading") {
    return (
      <main className="bootstrap-shell" role="status">
        Восстановление локальной доски…
      </main>
    );
  }
  if (bootstrap.kind === "recovery-required") {
    return (
      <RecoveryScreen
        currentRevisionId={bootstrap.currentRevisionId}
        documentId={localDocumentId}
        onContinue={(document, currentRevisionId) =>
          setBootstrap({
            document,
            initialRevisionId: currentRevisionId,
            kind: "ready",
            notice:
              "Предыдущие повреждённые данные сохранены в локальной истории.",
            persistedDocument: null,
          })
        }
        repository={repository}
      />
    );
  }
  if (bootstrap.kind === "failure") {
    return (
      <PersistedWorkspace
        document={createInitialDocument()}
        geometryOsClient={geometryOsClient}
        initialRevisionId={null}
        notice={`${bootstrap.code}: ${bootstrap.message}`}
        persistedDocument={null}
        repository={repository}
      />
    );
  }
  return (
    <PersistedWorkspace
      document={bootstrap.document}
      geometryOsClient={geometryOsClient}
      initialRevisionId={bootstrap.initialRevisionId}
      notice={bootstrap.notice}
      persistedDocument={bootstrap.persistedDocument}
      repository={repository}
    />
  );
}
