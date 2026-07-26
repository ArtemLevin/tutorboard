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
  type GeometryOsClient,
} from "../core/public";
import { geometryOsAdapterContractVersion } from "../adapters/geometryos-http/public";
import { persistenceAdapterContractVersion } from "../adapters/persistence-dexie/public";
import { canvasAdapterContractVersion } from "../adapters/canvas-konva/public";
import { PersistedApp, type ProductNotification } from "./PersistedApp";
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

interface ProductShellProps {
  readonly environment: AppEnvironment;
  readonly geometryOsClient: GeometryOsClient;
  readonly repository: BoardDocumentRepository;
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

function DocumentsPage() {
  return (
    <main className="product-page" tabIndex={-1}>
      <header>
        <p className="product-eyebrow">Локальная библиотека</p>
        <h1>Документы</h1>
        <p>
          Сейчас TutorBoard работает как надёжное single-user приложение.
          Серверный список занятий подключается на Phase 4.
        </p>
      </header>
      <section aria-label="Локальные документы" className="document-grid">
        <article>
          <span aria-hidden="true">▦</span>
          <div>
            <h2>TutorBoard canvas</h2>
            <p>Автосохранение · BoardDocument 1.0</p>
          </div>
          <a href="#/board">Открыть доску</a>
        </article>
        <article className="document-placeholder">
          <span aria-hidden="true">＋</span>
          <div>
            <h2>Новый документ</h2>
            <p>Появится вместе с lesson context и серверным repository.</p>
          </div>
        </article>
      </section>
    </main>
  );
}

function SettingsPage({
  environment,
}: {
  readonly environment: AppEnvironment;
}) {
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  return (
    <main className="product-page settings-page" tabIndex={-1}>
      <header>
        <p className="product-eyebrow">Локальная конфигурация</p>
        <h1>Настройки</h1>
        <p>Флаги поставки читаются при старте и не изменяют документ.</p>
      </header>
      <section aria-labelledby="feature-title">
        <h2 id="feature-title">Возможности</h2>
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
          <dt>GeometryOS adapter</dt>
          <dd>{geometryOsAdapterContractVersion}</dd>
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
  repository,
}: ProductShellProps) {
  const [route, setRoute] = useState(() =>
    resolveProductRoute(window.location.hash),
  );
  const [notifications, setNotifications] = useState<
    readonly NotificationRecord[]
  >([]);
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

  const diagnosticsEnabled = environment.features.developmentDiagnostics;
  const effectiveRoute =
    route === "diagnostics" && !diagnosticsEnabled ? "board" : route;
  return (
    <div className="product-shell">
      <ProductNavigation
        diagnosticsEnabled={diagnosticsEnabled}
        route={effectiveRoute}
      />
      <div className="product-content">
        <ProductErrorBoundary key={effectiveRoute}>
          {effectiveRoute === "board" ? (
            <PersistedApp
              enableSnapshots={environment.features.documentSnapshots}
              geometryOsClient={
                environment.features.geometryPrompt
                  ? geometryOsClient
                  : undefined
              }
              onNotification={notify}
              repository={repository}
            />
          ) : effectiveRoute === "documents" ? (
            <DocumentsPage />
          ) : effectiveRoute === "settings" ? (
            <SettingsPage environment={environment} />
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
