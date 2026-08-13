import { describe, expect, it } from "vitest";

import legacyDocumentJson from "../../../fixtures/board-document-0.1.json?raw";
import frozenDocumentJson from "../../../fixtures/board-document-1.0.json?raw";
import {
  boardDocumentSchemaVersion,
  serializeBoardDocument,
} from "../../../../src/core/public";
import {
  exportTutorBoardDocument,
  importTutorBoardDocument,
  maximumTutorBoardDocumentImportBytes,
  renderBoardSnapshotSvg,
} from "../../../../src/modules/document-transfer/public";

describe("TutorBoard document transfer", () => {
  it("round-trips the frozen 1.0 fixture with deterministic bytes", () => {
    const imported = importTutorBoardDocument(frozenDocumentJson);
    expect(imported.status).toBe("ok");
    if (imported.status !== "ok") {
      return;
    }

    const first = exportTutorBoardDocument(imported.document);
    const second = exportTutorBoardDocument(imported.document);
    expect(first).toEqual(second);
    expect(first.status).toBe("ok");
    if (first.status !== "ok") {
      return;
    }
    expect(first.filename).toMatch(/\.tutorboard\.json$/u);
    expect(first.bytes).toBe(new TextEncoder().encode(first.json).byteLength);
    expect(importTutorBoardDocument(first.json)).toMatchObject({
      document: imported.document,
      migrated: false,
      sourceSchemaVersion: boardDocumentSchemaVersion,
      status: "ok",
    });
  });

  it("migrates supported legacy documents during import", () => {
    expect(importTutorBoardDocument(legacyDocumentJson)).toMatchObject({
      migrated: true,
      sourceSchemaVersion: "0.1",
      status: "ok",
    });
  });

  it("reports JSON, schema, object and document compatibility separately", () => {
    expect(importTutorBoardDocument("{")).toMatchObject({
      code: "document-import.invalid-json",
      status: "error",
    });
    expect(
      importTutorBoardDocument(JSON.stringify({ schemaVersion: "99.0" })),
    ).toMatchObject({
      code: "document-import.incompatible-schema",
      schemaVersion: "99.0",
      status: "error",
    });

    const imported = importTutorBoardDocument(frozenDocumentJson);
    if (imported.status !== "ok") {
      throw new Error("Frozen fixture must be readable.");
    }
    const unknownObject = {
      ...imported.document,
      objects: {
        "object:future": {
          id: "object:future",
          kind: "future.widget",
        },
      },
      order: ["object:future"],
    };
    expect(
      importTutorBoardDocument(JSON.stringify(unknownObject)),
    ).toMatchObject({
      code: "document-import.incompatible-object",
      objectKinds: ["future.widget"],
      status: "error",
    });
    expect(
      importTutorBoardDocument(
        JSON.stringify({
          ...imported.document,
          id: "",
        }),
      ),
    ).toMatchObject({
      code: "document-import.invalid-document",
      status: "error",
    });
  });

  it("rejects an oversized document before parsing", () => {
    expect(
      importTutorBoardDocument(
        " ".repeat(maximumTutorBoardDocumentImportBytes + 1),
      ),
    ).toMatchObject({
      code: "document-import.too-large",
      status: "error",
    });
  });

  it("creates a deterministic, escaped SVG diagnostics snapshot", () => {
    const imported = importTutorBoardDocument(frozenDocumentJson);
    if (imported.status !== "ok") {
      throw new Error("Frozen fixture must be readable.");
    }
    const document = {
      ...imported.document,
      title: 'Algebra <review> & "notes"',
    };
    const first = renderBoardSnapshotSvg(document, {
      height: 600,
      width: 800,
    });
    expect(first).toBe(
      renderBoardSnapshotSvg(document, { height: 600, width: 800 }),
    );
    expect(first).toContain('viewBox="0 0 800 600"');
    expect(first).toContain(
      'aria-label="Algebra &lt;review&gt; &amp; &quot;notes&quot;"',
    );
    expect(first).not.toContain("<script");

    const serialized = serializeBoardDocument(imported.document);
    expect(serialized.ok).toBe(true);
  });
});
