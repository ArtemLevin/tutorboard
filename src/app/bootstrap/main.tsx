import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { createGeometryOsHttpClient } from "../../adapters/geometryos-http/public";
import { createBoardHttpRepository } from "../../adapters/board-http/public";
import {
  createDexieBoardDocumentRepository,
  createDexiePendingBoardCommandQueue,
} from "../../adapters/persistence-dexie/public";
import { ProductShell } from "../ProductShell";
import { readEnvironment } from "../configuration/environment";
import { readLessonBoardContext } from "../configuration/lesson-context";

const root = document.getElementById("root");

if (root === null) {
  throw new Error("TutorBoard root element is missing");
}

const repository = createDexieBoardDocumentRepository();
const environment = readEnvironment();
const geometryOsClient = createGeometryOsHttpClient({
  baseUrl: environment.geometryOsBaseUrl,
});
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
      repository={repository}
      serverSync={serverSync}
    />
  </StrictMode>,
);
