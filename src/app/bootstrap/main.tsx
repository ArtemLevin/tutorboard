import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { createGeometryOsHttpClient } from "../../adapters/geometryos-http/public";
import { createBoardHttpRepository } from "../../adapters/board-http/public";
import {
  createDexieBoardDocumentRepository,
  createDexiePendingBoardCommandQueue,
} from "../../adapters/persistence-dexie/public";
import { ProductShell } from "../ProductShell";
import { SmartInkDiagnosticsPanel } from "../SmartInkDiagnosticsPanel";
import { readBoardLaunchContext } from "../configuration/board-launch-context";
import { readEnvironment } from "../configuration/environment";
import { createConfiguredMathInkRecognizers } from "./math-ink";

const root = document.getElementById("root");

if (root === null) {
  throw new Error("TutorBoard root element is missing");
}

const environment = readEnvironment();
const launchContext = readBoardLaunchContext(window.location);

if (launchContext.kind === "standalone") {
  createRoot(root).render(
    <StrictMode>
      <main className="recovery-shell">
        <section className="recovery-card">
          <span aria-hidden="true" className="recovery-icon">
            ↻
          </span>
          <h1>Совместная доска готовится к подключению</h1>
          <p>
            Маршрут распознан, но standalone access runtime будет включён после
            серверных этапов B1/B2 и frontend-этапа T1.
          </p>
        </section>
      </main>
    </StrictMode>,
  );
} else {
  const repository = createDexieBoardDocumentRepository();
  const geometryOsClient = createGeometryOsHttpClient({
    baseUrl: environment.geometryOsBaseUrl,
  });
  const mathInkRecognizers = createConfiguredMathInkRecognizers(environment);
  const lessonContext =
    launchContext.kind === "legacy-lesson"
      ? {
          documentId: launchContext.documentId,
          lessonId: launchContext.lessonId,
        }
      : null;
  const serverSync =
    environment.features.serverSync && lessonContext !== null
      ? {
          ...lessonContext,
          queue: createDexiePendingBoardCommandQueue(),
          repository: createBoardHttpRepository({
            baseUrl: environment.boardApiBaseUrl,
          }),
        }
      : undefined;

  createRoot(root).render(
    <StrictMode>
      <ProductShell
        environment={environment}
        geometryOsClient={geometryOsClient}
        mathInkRecognizers={mathInkRecognizers}
        repository={repository}
        serverSync={serverSync}
      />
      {environment.features.smartInk &&
      environment.features.smartInkDiagnostics ? (
        <SmartInkDiagnosticsPanel />
      ) : null}
    </StrictMode>,
  );
}
