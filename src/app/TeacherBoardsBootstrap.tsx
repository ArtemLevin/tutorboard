import { useEffect, useState } from "react";

import { fetchTeacherManagementContext } from "../adapters/board-http/public";
import type { TeacherManagementContext } from "../core/public";
import type { AppEnvironment } from "./configuration/environment";
import { TeacherBoardsWorkspace } from "./TeacherBoardsWorkspace";

type BootstrapState =
  | { readonly kind: "loading" }
  | { readonly context: TeacherManagementContext; readonly kind: "ready" }
  | { readonly kind: "unavailable" };

export function TeacherBoardsBootstrap({
  environment,
}: {
  readonly environment: AppEnvironment;
}) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<BootstrapState>({ kind: "loading" });

  useEffect(() => {
    let active = true;
    void fetchTeacherManagementContext({
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
  }, [attempt, environment.boardApiBaseUrl]);

  if (state.kind === "loading") {
    return (
      <main className="recovery-shell">
        <section aria-live="polite" className="recovery-card">
          <span aria-hidden="true" className="recovery-icon">
            ↻
          </span>
          <h1>Открываем доски преподавателя</h1>
          <p>Проверяем защищённую сессию…</p>
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
          <h1>Управление досками недоступно</h1>
          <p role="alert">
            Этот раздел доступен только в авторизованной сессии преподавателя.
          </p>
          <button
            onClick={() => {
              setState({ kind: "loading" });
              setAttempt((value) => value + 1);
            }}
            type="button"
          >
            Проверить ещё раз
          </button>
        </section>
      </main>
    );
  }

  return (
    <TeacherBoardsWorkspace context={state.context} environment={environment} />
  );
}
