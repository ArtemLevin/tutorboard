import { useEffect, useMemo, useState } from "react";

import {
  createStandaloneBoardHttpRepository,
  fetchStandaloneBoardAccessContext,
} from "../adapters/board-http/public";
import { createDexiePendingBoardCommandQueue } from "../adapters/persistence-dexie/public";
import type { BoardAccessContext } from "../core/access/public";
import type { DocumentId, GeometryOsClient } from "../core/public";
import type {
  MathInkRecognitionProvider,
  MathInkRecognizer,
} from "../modules/handwritten-function/public";
import type { AppEnvironment } from "./configuration/environment";
import { readFormulaRecognitionSettings } from "./configuration/formula-recognition-settings";
import { SyncedApp } from "./SyncedApp";

interface StandaloneBoardBootstrapProps {
  readonly boardId: DocumentId;
  readonly environment: AppEnvironment;
  readonly geometryOsClient: GeometryOsClient;
  readonly mathInkRecognizers?:
    | Readonly<Partial<Record<MathInkRecognitionProvider, MathInkRecognizer>>>
    | undefined;
}

type BootstrapState =
  | { readonly kind: "loading" }
  | { readonly context: BoardAccessContext; readonly kind: "ready" }
  | { readonly kind: "unavailable" };

function StandaloneBoardWorkspace({
  boardId,
  context,
  environment,
  geometryOsClient,
  mathInkRecognizers = {},
}: StandaloneBoardBootstrapProps & { readonly context: BoardAccessContext }) {
  const repository = useMemo(
    () =>
      createStandaloneBoardHttpRepository(context, {
        baseUrl: environment.boardApiBaseUrl,
      }),
    [context, environment.boardApiBaseUrl],
  );
  const queue = useMemo(() => createDexiePendingBoardCommandQueue(), []);
  const selectedProvider = readFormulaRecognitionSettings().provider;
  const mathInkRecognizer = mathInkRecognizers[selectedProvider];

  useEffect(
    () => () => {
      queue.close?.();
    },
    [queue],
  );

  return (
    <SyncedApp
      accessContext={context}
      documentId={boardId}
      geometryOsClient={
        environment.features.geometryPrompt ? geometryOsClient : undefined
      }
      mathInkRecognizer={mathInkRecognizer}
      queue={queue}
      repository={repository}
    />
  );
}

export function StandaloneBoardBootstrap({
  boardId,
  environment,
  geometryOsClient,
  mathInkRecognizers,
}: StandaloneBoardBootstrapProps) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<BootstrapState>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    setState({ kind: "loading" });
    void fetchStandaloneBoardAccessContext(boardId, {
      baseUrl: environment.boardApiBaseUrl,
    })
      .then((context) => {
        if (active) setState({ context, kind: "ready" });
      })
      .catch(() => {
        if (active) setState({ kind: "unavailable" });
      });
    return () => {
      active = false;
    };
  }, [attempt, boardId, environment.boardApiBaseUrl]);

  if (state.kind === "loading") {
    return (
      <main className="recovery-shell">
        <section aria-live="polite" className="recovery-card">
          <span aria-hidden="true" className="recovery-icon">
            ↻
          </span>
          <h1>Подключаем совместную доску</h1>
          <p>Проверяем доступ и актуальную серверную ревизию…</p>
        </section>
      </main>
    );
  }

  if (state.kind === "unavailable") {
    return (
      <main className="recovery-shell">
        <section className="recovery-card">
          <span aria-hidden="true" className="recovery-icon">
            !
          </span>
          <h1>Доступ к доске недоступен</h1>
          <p role="alert">
            Ссылка могла истечь или быть отозвана. Проверьте адрес либо
            повторите подключение.
          </p>
          <button
            onClick={() => setAttempt((value) => value + 1)}
            type="button"
          >
            Повторить подключение
          </button>
        </section>
      </main>
    );
  }

  return (
    <StandaloneBoardWorkspace
      boardId={boardId}
      context={state.context}
      environment={environment}
      geometryOsClient={geometryOsClient}
      mathInkRecognizers={mathInkRecognizers}
    />
  );
}
