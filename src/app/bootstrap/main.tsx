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
import { StandaloneBoardBootstrap } from "../StandaloneBoardBootstrap";
import { TeacherBoardsBootstrap } from "../TeacherBoardsBootstrap";
import { readBoardLaunchContext } from "../configuration/board-launch-context";
import { readEnvironment } from "../configuration/environment";
import { createConfiguredMathInkRecognizers } from "./math-ink";

const root = document.getElementById("root");

if (root === null) {
  throw new Error("TutorBoard root element is missing");
}

const environment = readEnvironment();
const teacherBoardsRoute = window.location.pathname.replace(/\/+$/u, "") === "/boards";
const launchContext = readBoardLaunchContext(window.location);
const geometryOsClient = createGeometryOsHttpClient({
  baseUrl: environment.geometryOsBaseUrl,
});
const mathInkRecognizers = createConfiguredMathInkRecognizers(environment);

if (teacherBoardsRoute) {
  createRoot(root).render(
    <StrictMode>
      <TeacherBoardsBootstrap environment={environment} />
    </StrictMode>,
  );
} else if (launchContext.kind === "standalone") {
  if (window.location.hash !== "#/board") {
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}#/board`,
    );
  }
  createRoot(root).render(
    <StrictMode>
      <StandaloneBoardBootstrap
        boardId={launchContext.boardId}
        environment={environment}
        geometryOsClient={geometryOsClient}
        mathInkRecognizers={mathInkRecognizers}
      />
    </StrictMode>,
  );
} else {
  const repository = createDexieBoardDocumentRepository();
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
