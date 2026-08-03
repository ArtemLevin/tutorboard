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
import { readEnvironment } from "../configuration/environment";
import { readLessonBoardContext } from "../configuration/lesson-context";
import { createConfiguredMathInkRecognizers } from "./math-ink";

const root = document.getElementById("root");

if (root === null) {
  throw new Error("TutorBoard root element is missing");
}

const repository = createDexieBoardDocumentRepository();
const environment = readEnvironment();
const geometryOsClient = createGeometryOsHttpClient({
  baseUrl: environment.geometryOsBaseUrl,
});
const mathInkRecognizers = createConfiguredMathInkRecognizers(environment);
const lessonContext = readLessonBoardContext(window.location.search);
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
