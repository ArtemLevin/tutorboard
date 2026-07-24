import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { createDexieBoardDocumentRepository } from "../../adapters/persistence-dexie/public";
import { PersistedApp } from "../PersistedApp";

const root = document.getElementById("root");

if (root === null) {
  throw new Error("TutorBoard root element is missing");
}

const repository = createDexieBoardDocumentRepository();

createRoot(root).render(
  <StrictMode>
    <PersistedApp repository={repository} />
  </StrictMode>,
);
