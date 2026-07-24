import { describe, expect, it } from "vitest";

import {
  createEmptyBoardDocument,
  documentId,
  localDiagnosticSchemaVersion,
  serializeBoardDocument,
} from "../../../../src/core/public";
import { importLocalDocumentJson } from "../../../../src/modules/local-persistence/public";

const expectedId = documentId("document:local-board");

function serializedDocument(title: string): string {
  const serialized = serializeBoardDocument(
    createEmptyBoardDocument({
      createdAt: "2026-07-24T07:00:00.000Z",
      id: expectedId,
      title,
    }),
  );
  if (!serialized.ok) {
    throw new Error("Fixture is invalid.");
  }
  return serialized.json;
}

describe("importLocalDocumentJson", () => {
  it("imports a direct BoardDocument", () => {
    const result = importLocalDocumentJson(
      serializedDocument("Direct"),
      expectedId,
    );
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.document.title).toBe("Direct");
    }
  });

  it("selects the newest compatible diagnostic revision", () => {
    const result = importLocalDocumentJson(
      JSON.stringify({
        documentId: expectedId,
        generatedAt: "2026-07-24T09:00:00.000Z",
        head: null,
        recovery: null,
        revisions: [
          { sequence: 1, serializedDocument: serializedDocument("Old") },
          { sequence: 3, serializedDocument: "{" },
          {
            sequence: 2,
            serializedDocument: serializedDocument("Latest valid"),
          },
        ],
        schemaVersion: localDiagnosticSchemaVersion,
      }),
      expectedId,
    );
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.document.title).toBe("Latest valid");
    }
  });
});
