import { describe, expect, it } from "vitest";

import layoutRequestJson from "../../../../contracts/geometryos/fixtures/layout-success.request.json?raw";
import layoutResponseJson from "../../../../contracts/geometryos/fixtures/layout-success.response.json?raw";
import { createGeometryOsHttpClient } from "../../../../src/adapters/geometryos-http/public";
import {
  geometryImportId,
  geometryOsRequestId,
  deserializeBoardDocument,
  reduceBoardDocument,
  selectBoardScene,
  serializeBoardDocument,
  type GeometryOsLayoutResult,
  type JsonValue,
} from "../../../../src/core/public";
import { createGeometryImportCommand } from "../../../../src/modules/geometry-import/public";
import { emptyDocument, metadata } from "../../core/helpers";

const requestId = geometryOsRequestId("tutorboard-layout-import");
const canonicalGir = JSON.parse(layoutRequestJson) as JsonValue;
const responsePayload = JSON.parse(layoutResponseJson) as JsonValue;

async function layoutSuccess(): Promise<
  Extract<GeometryOsLayoutResult, { kind: "success" }>
> {
  const client = createGeometryOsHttpClient({
    baseUrl: "https://geometry.example.test",
    createRequestId: () => requestId,
    fetch: () =>
      Promise.resolve(
        new Response(JSON.stringify(responsePayload), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "X-Request-ID": requestId,
          },
        }),
      ),
  });
  const result = await client.startLayout({ canonicalGir }).result;
  if (result.kind !== "success") {
    throw new Error(`Expected layout success, received ${result.kind}.`);
  }
  return result;
}

async function command() {
  const result = createGeometryImportCommand({
    importId: geometryImportId("import:triangle-altitude"),
    layoutResult: await layoutSuccess(),
    metadata: metadata("geometry-import", "2026-07-24T12:01:00.000Z"),
    placement: { x: 320, y: 180 },
    prompt: "Построй треугольник ABC и высоту AH",
  });
  expect(result.status).toBe("success");
  if (result.status !== "success") {
    throw new Error(`Expected import command, received ${result.code}.`);
  }
  return result;
}

describe("Layout-to-Board atomic import", () => {
  it("creates editable board primitives with deterministic semantic mapping", async () => {
    const prepared = await command();
    const applied = reduceBoardDocument(emptyDocument(), prepared.command);

    expect(applied.ok).toBe(true);
    if (!applied.ok) return;

    const objects = Object.values(applied.document.objects).filter(
      (item) => item !== undefined,
    );
    expect(objects.filter((item) => item.kind === "drawing.line")).toHaveLength(
      4,
    );
    expect(
      objects.filter((item) => item.kind === "drawing.ellipse"),
    ).toHaveLength(4);
    expect(objects.filter((item) => item.kind === "drawing.text")).toHaveLength(
      4,
    );
    expect(applied.document.geometryImports).toHaveProperty(
      "import:triangle-altitude",
    );
    const record =
      applied.document.geometryImports[
        geometryImportId("import:triangle-altitude")
      ];
    expect(record?.mapping.ABC).toHaveLength(3);
    expect(record?.mapping.A).toHaveLength(2);
    expect(record?.visualTransform.translation).toEqual({ x: 320, y: 180 });

    const scene = selectBoardScene(applied.document);
    expect(scene.items.every((item) => item.transforms.length === 1)).toBe(
      true,
    );
    const serialized = serializeBoardDocument(applied.document);
    expect(serialized.ok).toBe(true);
    if (serialized.ok) {
      const restored = deserializeBoardDocument(serialized.json);
      expect(restored.status).toBe("ok");
      if (restored.status === "ok") {
        expect(restored.document).toEqual(applied.document);
      }
    }
  });

  it("commits the whole import once and leaves the document unchanged on collision", async () => {
    const prepared = await command();
    const first = reduceBoardDocument(emptyDocument(), prepared.command);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const duplicate = reduceBoardDocument(first.document, {
      ...prepared.command,
      id: metadata("geometry-import-duplicate", "2026-07-24T12:02:00.000Z").id,
      timestamp: "2026-07-24T12:02:00.000Z",
    });

    expect(duplicate.ok).toBe(false);
    expect(duplicate.document).toBe(first.document);
    if (!duplicate.ok) {
      expect(duplicate.error.code).toBe("command.import-exists");
    }
  });

  it("rejects a missing Layout element before producing a command", async () => {
    const success = await layoutSuccess();
    const withoutAltitudeFoot = {
      ...success,
      layoutDocument: {
        ...success.layoutDocument,
        points: Object.fromEntries(
          Object.entries(success.layoutDocument.points).filter(
            ([id]) => id !== "H",
          ),
        ),
      },
    };
    const result = createGeometryImportCommand({
      importId: geometryImportId("import:missing-layout-point"),
      layoutResult: withoutAltitudeFoot,
      metadata: metadata("missing-layout-point"),
      placement: { x: 0, y: 0 },
      prompt: "Построй высоту",
    });

    expect(result).toMatchObject({
      status: "failure",
      code: "geometry-import.layout-element-missing",
    });
    expect("command" in result).toBe(false);
  });

  it("preserves a dashed Layout segment as an editable dashed board line", async () => {
    const success = await layoutSuccess();
    const result = createGeometryImportCommand({
      importId: geometryImportId("import:dashed-layout"),
      layoutResult: {
        ...success,
        layoutDocument: {
          ...success.layoutDocument,
          segments: success.layoutDocument.segments.map((segment, index) =>
            index === 0 ? { ...segment, style: "dashed" as const } : segment,
          ),
        },
      },
      metadata: metadata("dashed-layout"),
      placement: { x: 0, y: 0 },
      prompt: "Пунктирный треугольник",
    });

    expect(result.status).toBe("success");
    if (result.status !== "success") return;
    expect(
      result.command.objects.some(
        (object) =>
          object.kind === "drawing.line" && object.lineStyle === "dashed",
      ),
    ).toBe(true);
  });
});
