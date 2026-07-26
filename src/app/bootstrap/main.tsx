import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { createGeometryOsHttpClient } from "../../adapters/geometryos-http/public";
import { createDexieBoardDocumentRepository } from "../../adapters/persistence-dexie/public";
import { PersistedApp } from "../PersistedApp";
import { readEnvironment } from "../configuration/environment";

const root = document.getElementById("root");

if (root === null) {
  throw new Error("TutorBoard root element is missing");
}

const repository = createDexieBoardDocumentRepository();
const environment = readEnvironment();
const geometryOsClient = createGeometryOsHttpClient({
  baseUrl: environment.geometryOsBaseUrl,
});

createRoot(root).render(
  <StrictMode>
    <PersistedApp geometryOsClient={geometryOsClient} repository={repository} />
  </StrictMode>,
);
