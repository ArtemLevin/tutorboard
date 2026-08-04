import {
  Component,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";

import {
  boardDocumentSchemaVersion,
  type BoardDocumentRepository,
  type BoardPlatformRepository,
  type BoardRevisionDescriptor,
  type DocumentId,
  type GeometryOsClient,
  type PendingBoardCommandQueue,
  type ServerBoardDescriptor,
} from "../core/public";
import { geometryOsAdapterContractVersion } from "../adapters/geometryos-http/public";
import { mathInkHttpAdapterContractVersion } from "../adapters/math-ink-http/public";
import type {
  MathInkRecognitionProvider,
  MathInkRecognizer,
} from "../modules/handwritten-function/public";
import { persistenceAdapterContractVersion } from "../adapters/persistence-dexie/public";
import { canvasAdapterContractVersion } from "../adapters/canvas-konva/public";
import { PersistedApp, type ProductNotification } from "./PersistedApp";
import { SyncedApp } from "./SyncedApp";
import { FormulaRecognitionSettingsPanel } from "./FormulaRecognitionSettingsPanel";
import {
  readFormulaRecognitionSettings,
  writeFormulaRecognitionSettings,
} from "./configuration/formula-recognition-settings";
import type { AppEnvironment } from "./configuration/environment";

export type ProductRoute = "board" | "diagnostics" | "documents" | "settings";

// Route normalization is exported for the shell contract test.
// eslint-disable-next-line react-refresh/only-export-components
export function resolveProductRoute(hash: string): ProductRoute {
  switch (hash.replace(/^#\/?/u, "").replace(/\/+$/u, "")) {
    case "":
    case "board":
      return "board";
    case "documents":
      return "documents";
    case "settings":
      return "settings";
    case "diagnostics":
      return "diagnostics";
    default:
      return "board";
  }
}

interface ProductErrorBoundaryProps {
  readonly children: ReactNode;
}

interface ProductErrorBoundaryState {
  readonly error: Error | null;
}

export class ProductErrorBoundary extends Component<
  ProductErrorBoundaryProps,
  ProductErrorBoundaryState
> {
  public override state: ProductErrorBoundaryState = { error: null };

  public static getDerivedStateFromError(error: Error) {
    return { error };
  }

  public override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("TutorBoard product boundary", error, info.componentStack);
  }

  public override render() {
    if (this.state.error !== null) {
      return (
        <main className="product-page product-failure">
          <span aria-hidden="true">!</span>
          <h1>Не удалось открыть TutorBoard</h1>
          <p>
            Документ в локальном хранилище не удалён. Перезагрузите приложение
            или откройте раздел диагностики.
          </p>
          <button
            onClick={() => {
              this.setState({ error: null });
              window.location.hash = "/diagnostics";
            }}
            type="button"
          >
            Открыть диагностику
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}

export interface ProductServerSync {
  readonly documentId: DocumentId;
  readonly lessonId: string;
  readonly queue: PendingBoardCommandQueue;
  readonly repository: BoardPlatformRepository;
}

interface ProductShellProps {
  readonly environment: AppEnvironment;
  readonly geometryOsClient: GeometryOsClient;
  readonly mathInkRecognizers?:
    | Readonly<Partial<Record<MathInkRecognitionProvider, MathInkRecognizer>>>
    | undefined;
  readonly repository: BoardDocumentRepository;
  readonly serverSync?: ProductServerSync | undefined;
}

interface NotificationRecord extends ProductNotification {
  readonly id: number;
}

function ProductNavigation({
  diagnosticsEnabled,
  route,
}: {
  readonly diagnosticsEnabled: boolean;
  readonly route: ProductRoute;
}) {
  const links = [
    { icon: "▦", label: "Доска", route: "board" },
    { icon: "□", label: "Документы", route: "documents" },
    { icon: "⚙", label: "Настройки", route: "settings" },
    ...(diagnosticsEnabled
      ? [{ icon: "⌁", label: "Диагностика", route: "diagnostics" }]
      : []),
  ] as const;
  return (
    <nav aria-label="Основная навигация" className="product-navigation">
      <a
        aria-label="TutorBoard — открыть доску"
        className="product-logo"
        href="#/board"
      >
        T
      </a>
      <div>
        {links.map((link) => (
          <a
            aria-current={route === link.route ? "page" : undefined}
            href={`#/${link.route}`}
            key={link.route}
          >
            <span aria-hidden="true">{link.icon}</span>
            <small>{link.label}</small>
          </a>
        ))}
      </div>
    </nav>
  );
}

function DocumentsPage({
  serverSync,
}: {
  readonly serverSync?: ProductServerSync | undefined;
}) {
  const [documents, setDocuments] = useState<readonly ServerBoardDescriptor[]>(
    [],
  );
  const [revisions, setRevisions] = useState<
    readonly BoardRevisionDescriptor[]
  >([]);
  const [revisionDocumentId, setRevisionDocumentId] =
    useState<DocumentId | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    if (serverSync === undefined) {
      return;
    }
    try {
      const [items, context] = await Promise.all([
        serverSync.repository.listBoards(serverSync.lessonId, true),
        serverSync.repository.context(),
      ]);
      setDocuments(items);
      setCanManage(context.role === "admin" || context.role === "tutor");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Не удалось получить документы занятия.",
      );
    }
  }, [serverSync]);
  useEffect(() => {
    const load = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(load);
  }, [refresh]);
  const setArchived = async (
    document: ServerBoardDescriptor,
    archived: boolean,
  ) => {
    if (serverSync === undefined) {
      return;
    }
    const context = await serverSync.repository.context();
    if (archived) {
      await serverSync.repository.archive(
        document.documentId,
        context.csrfToken,
      );
    } else {
      await serverSync.repository.unarchive(
        document.documentId,
        context.csrfToken,
      );
    }
    setStatus(archived ? "Доска перенесена в архив." : "Доска восстановлена.");
    await refresh();
  };
  return (
    <main className="product-page" tabIndex={-1}>
      <header>
        <p className="product-eyebrow">
          {serverSync === undefined ? "Локальная библиотека" : "Занятие"}
        </p>
        <h1>Документы</h1>
        <p>
          {serverSync === undefined
            ? "TutorBoard поддерживает локальные документы и доски, открытые из контекста занятия."
            : "Архив, история точных серверных ревизий и переход к активной доске занятия."}
        </p>
      </header>
      <section aria-label="Локальные документы" className="document-grid">
        {serverSync === undefined ? (
          <article>
            <span aria-hidden="true">▦</span>
            <div>
              <h2>TutorBoard canvas</h2>
              <p>Автосохранение · BoardDocument 1.0</p>
            </div>
            <a href="#/board">Открыть доску</a>
          </article>
        ) : documents.length === 0 ? (
          <article className="document-placeholder">
            <span aria-hidden="true">↻</span>
            <div>
              <h2>Доски не найдены</h2>
              <p>Откройте доску занятия, чтобы создать первую ревизию.</p>
            </div>
          </article>
        ) : (
          documents.map((document) => (
            <article key={document.documentId}>
              <span aria-hidden="true">▦</span>
              <div>
                <h2>{document.documentId}</h2>
                <p>
                  Ревизия {document.currentRevision}
                  {document.archivedAt === null ? "" : " · архив"}
                </p>
                {revisions.length > 0 &&
                document.documentId === revisionDocumentId ? (
                  <small>{revisions.length} сохранённых точек истории</small>
                ) : null}
              </div>
              <div className="document-actions">
                <a
                  href={`?lessonId=${encodeURIComponent(serverSync.lessonId)}&documentId=${encodeURIComponent(document.documentId)}#/board`}
                >
                  Открыть
                </a>
                <button
                  onClick={() =>
                    void serverSync.repository
                      .listRevisions(document.documentId)
                      .then((items) => {
                        setRevisionDocumentId(document.documentId);
                        setRevisions(items);
                      })
                  }
                  type="button"
                >
                  История
                </button>
                {canManage ? (
                  <button
                    onClick={() =>
                      void setArchived(document, document.archivedAt === null)
                    }
                    type="button"
                  >
                    {document.archivedAt === null ? "В архив" : "Восстановить"}
                  </button>
                ) : null}
              </div>
            </article>
          ))
        )}
      </section>
      {status === null ? null : <p role="status">{status}</p>}
    </main>
  );
}

function SettingsPage({
  environment,
  onProviderChange,
  recognizers,
  selectedProvider,
}: {
  readonly environment: AppEnvironment;
  readonly onProviderChange: (provider: MathInkRecognitionProvider) => void;
  readonly recognizers: Readonly<
    Partial<Record<MathInkRecognitionProvider, MathInkRecognizer>>
  >;
  readonly selectedProvider: MathInkRecognitionProvider;
}) {
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  return (
    <main className="product-page settings-page" tabIndex={-1}>
      <header>
        <p className="product-eyebrow">Локальная конфигурация</p>
        <h1>Настройки</h1>
        <p>Пользовательские настройки применяются к этой установке браузера.</p>
      </header>
      <FormulaRecognitionSettingsPanel
        onProviderChange={onProviderChange}
        recognizers={recognizers}
        selectedProvider={selectedProvider}
      />
      <section aria-labelledby="feature-title">
        <h2 id="feature-title">Возможности сборки</h2>
        <dl className="settings-list">
          {Object.entries(environment.features).map(([name, enabled]) => (
            <div key={name}>
              <dt>{name}</dt>
              <dd>{enabled ? "Включено" : "Выключено"}</dd>
            </div>
          ))}
          <div>
            <dt>reducedMotion</dt>
            <dd>{reducedMotion ? "Предпочтительно" : "Обычно"}</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}

function DiagnosticsPage({
  environment,
}: {
  readonly environment: AppEnvironment;
}) {
  return (
    <main className="product-page diagnostics-page" tabIndex={-1}>
      <header>
        <p className="product-eyebrow">Development diagnostics</p>
        <h1>Диагностика</h1>
        <p>
          Контрактные версии и runtime-состояние без пользовательских данных.
        </p>
      </header>
      <dl className="diagnostic-grid">
        <div>
          <dt>BoardDocument</dt>
          <dd>{boardDocumentSchemaVersion}</dd>
        </div>
        <div>
          <dt>Canvas adapter</dt>
          <dd>{canvasAdapterContractVersion}</dd>
        </div>
        <div>
          <dt>Сервис построения по тексту</dt>
          <dd>{geometryOsAdapterContractVersion}</dd>
        </div>
        <div>
          <dt>Math ink adapter</dt>
          <dd>{mathInkHttpAdapterContractVersion}</dd>
        </div>
        <div>
          <dt>Persistence adapter</dt>
          <dd>{persistenceAdapterContractVersion}</dd>
        </div>
        <div>
          <dt>Stage</dt>
          <dd>{environment.stage}</dd>
        </div>
        <div>
          <dt>Network</dt>
          <dd>{navigator.onLine ? "online" : "offline"}</dd>
        </div>
      </dl>
    </main>
  );
}

export function ProductShell({
  environment,
  geometryOsClient,
  mathInkRecognizers = {},
  repository,
  serverSync,
}: ProductShellProps) {
  const [route, setRoute] = useState(() =>
    resolveProductRoute(window.location.hash),
  );
  const [notifications, setNotifications] = useState<
    readonly NotificationRecord[]
  >([]);
  const [
    selectedFormulaRecognitionProvider,
    setSelectedFormulaRecognitionProvider,
  ] = useState<MathInkRecognitionProvider>(
    () => readFormulaRecognitionSettings().provider,
  );
  const notificationSequenceRef = useRef(0);
  const notificationTimersRef = useRef(new Set<number>());
  useEffect(() => {
    const updateRoute = () =>
      setRoute(resolveProductRoute(window.location.hash));
    window.addEventListener("hashchange", updateRoute);
    return () => window.removeEventListener("hashchange", updateRoute);
  }, []);
  useEffect(
    () => () => {
      for (const timer of notificationTimersRef.current) {
        window.clearTimeout(timer);
      }
      notificationTimersRef.current.clear();
    },
    [],
  );
  const notify = useCallback((notification: ProductNotification) => {
    const id = ++notificationSequenceRef.current;
    setNotifications((current) => [
      ...current.slice(-2),
      { ...notification, id },
    ]);
    const timer = window.setTimeout(() => {
      setNotifications((current) =>
        current.filter((candidate) => candidate.id !== id),
      );
      notificationTimersRef.current.delete(timer);
    }, 5_000);
    notificationTimersRef.current.add(timer);
  }, []);

  const selectFormulaRecognitionProvider = useCallback(
    (provider: MathInkRecognitionProvider) => {
      const settings = writeFormulaRecognitionSettings(provider);
      setSelectedFormulaRecognitionProvider(settings.provider);
      notify({
        kind: "success",
        message: "Способ распознавания формул сохранён.",
      });
    },
    [notify],
  );
  const mathInkRecognizer =
    mathInkRecognizers[selectedFormulaRecognitionProvider];
  const diagnosticsEnabled = environment.features.developmentDiagnostics;
  const effectiveRoute =
    route === "diagnostics" && !diagnosticsEnabled ? "board" : route;
  const boardRoute = effectiveRoute === "board";
  return (
    <div
      className={boardRoute ? "product-shell is-board-route" : "product-shell"}
    >
      {boardRoute ? null : (
        <ProductNavigation
          diagnosticsEnabled={diagnosticsEnabled}
          route={effectiveRoute}
        />
      )}
      <div className="product-content">
        <ProductErrorBoundary key={effectiveRoute}>
          {effectiveRoute === "board" ? (
            environment.features.serverSync && serverSync !== undefined ? (
              <SyncedApp
                documentId={serverSync.documentId}
                geometryOsClient={
                  environment.features.geometryPrompt
                    ? geometryOsClient
                    : undefined
                }
                lessonId={serverSync.lessonId}
                mathInkRecognizer={mathInkRecognizer}
                queue={serverSync.queue}
                repository={serverSync.repository}
              />
            ) : (
              <PersistedApp
                enableSnapshots={environment.features.documentSnapshots}
                geometryOsClient={
                  environment.features.geometryPrompt
                    ? geometryOsClient
                    : undefined
                }
                mathInkRecognizer={mathInkRecognizer}
                onNotification={notify}
                repository={repository}
              />
            )
          ) : effectiveRoute === "documents" ? (
            <DocumentsPage serverSync={serverSync} />
          ) : effectiveRoute === "settings" ? (
            <SettingsPage
              environment={environment}
              onProviderChange={selectFormulaRecognitionProvider}
              recognizers={mathInkRecognizers}
              selectedProvider={selectedFormulaRecognitionProvider}
            />
          ) : (
            <DiagnosticsPage environment={environment} />
          )}
        </ProductErrorBoundary>
      </div>
      <section
        aria-label="Уведомления"
        aria-live="polite"
        className="notification-center"
      >
        {notifications.map((notification) => (
          <div
            className={`notification is-${notification.kind}`}
            key={notification.id}
          >
            <span>{notification.message}</span>
            <button
              aria-label="Закрыть уведомление"
              onClick={() =>
                setNotifications((current) =>
                  current.filter(({ id }) => id !== notification.id),
                )
              }
              type="button"
            >
              ×
            </button>
          </div>
        ))}
      </section>
    </div>
  );
}
