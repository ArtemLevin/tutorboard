import { describe, expect, it } from "vitest";

import {
  actorId,
  boardObjectId,
  commandId,
  createEmptyBoardDocument,
  createVectorInkData,
  documentId,
  geometryImportId,
  groupId,
  readBoardDocument,
  reduceBoardDocument,
  type BoardDocument,
  type PenStrokeObject,
} from "../../../src/core/public";
import {
  boardClipboardSchemaVersion,
  copyBoardSelection,
  createPasteContentCommand,
} from "../../../src/modules/clipboard/public";
import { renderBoardSnapshotSvg } from "../../../src/modules/document-transfer/public";

const points = [
  { x: 10, y: 15 },
  { x: 35, y: 4 },
  { x: 70, y: 26 },
];

function legacyDocument11(): unknown {
  return {
    ...createEmptyBoardDocument({
      createdAt: "2026-08-04T12:00:00.000Z",
      id: documentId("document-vector-ink-legacy"),
      title: "Legacy ink",
    }),
    objects: {
      "object:legacy-pen": {
        groupId: null,
        id: "object:legacy-pen",
        kind: "drawing.pen-stroke",
        locked: false,
        points,
        position: { x: 0, y: 0 },
        rotation: 0,
        scale: { x: 1, y: 1 },
        source: { kind: "user" },
        style: {
          fill: null,
          opacity: 1,
          stroke: "#245d6b",
          strokeWidth: 6,
        },
        visible: true,
      },
    },
    order: ["object:legacy-pen"],
    schemaVersion: "1.1",
  };
}

function pressureStroke(): PenStrokeObject {
  return {
    groupId: null,
    id: boardObjectId("object:pressure-pen"),
    ink: createVectorInkData([
      { point: points[0]!, pressure: 0.15, timestampMs: 0 },
      { point: points[1]!, pressure: 0.55, timestampMs: 9 },
      { point: points[2]!, pressure: 0.95, timestampMs: 19 },
    ]),
    kind: "drawing.pen-stroke",
    locked: false,
    points,
    position: { x: 0, y: 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    source: { kind: "user" },
    style: {
      fill: null,
      opacity: 0.8,
      stroke: "#245d6b",
      strokeWidth: 6,
    },
    visible: true,
  };
}

function documentWithStroke(stroke: PenStrokeObject): BoardDocument {
  const empty = createEmptyBoardDocument({
    createdAt: "2026-08-04T12:00:00.000Z",
    id: documentId("document-vector-ink"),
    title: "Vector ink",
  });
  return {
    ...empty,
    objects: { [stroke.id]: stroke },
    order: [stroke.id],
  };
}

describe("BoardDocument 1.3 Vector Ink contract", () => {
  it("migrates legacy 1.1 pen strokes deterministically", () => {
    const first = readBoardDocument(legacyDocument11());
    const second = readBoardDocument(legacyDocument11());
    expect(first.status).toBe("ok");
    expect(second.status).toBe("ok");
    if (first.status !== "ok" || second.status !== "ok") return;
    expect(first.document.schemaVersion).toBe("1.3");
    const migrated = first.document.objects[boardObjectId("object:legacy-pen")];
    expect(migrated?.kind).toBe("drawing.pen-stroke");
    if (migrated?.kind !== "drawing.pen-stroke") return;
    expect(migrated.ink?.version).toBe("1.0");
    expect(migrated.ink?.samples.map(({ pressure }) => pressure)).toEqual([
      0.5, 0.5, 0.5,
    ]);
    expect(first.document).toEqual(second.document);
  });

  it("uses the same variable-width outline for SVG, PNG and PDF source rendering", () => {
    const svg = renderBoardSnapshotSvg(documentWithStroke(pressureStroke()), {
      height: 180,
      width: 240,
    });
    expect(svg).toContain('data-vector-ink-version="1.0"');
    expect(svg).toContain("<path");
    expect(svg).toContain('fill="#245d6b"');
    expect(svg).not.toContain("polyline");
    expect(svg).not.toContain("NaN");
  });

  it("deep-copies Vector Ink through clipboard and preserves it after paste", () => {
    const stroke = pressureStroke();
    const document = documentWithStroke(stroke);
    const copied = copyBoardSelection(document, [stroke.id]);
    expect(copied.status).toBe("ok");
    if (copied.status !== "ok") return;
    expect(copied.payload.schemaVersion).toBe(boardClipboardSchemaVersion);
    expect(boardClipboardSchemaVersion).toBe("1.3");
    const copiedStroke = copied.payload.objects[0];
    expect(copiedStroke?.kind).toBe("drawing.pen-stroke");
    if (copiedStroke?.kind !== "drawing.pen-stroke") return;
    expect(copiedStroke.ink).toEqual(stroke.ink);
    expect(copiedStroke.ink).not.toBe(stroke.ink);
    expect(copiedStroke.ink?.samples).not.toBe(stroke.ink?.samples);

    const command = createPasteContentCommand(
      copied.payload,
      {
        actorId: actorId("actor-vector-ink"),
        id: commandId("command-vector-ink-paste"),
        timestamp: "2026-08-04T12:01:00.000Z",
      },
      {
        geometryImport: (id) => geometryImportId(`copy:${id}`),
        group: (id) => groupId(`copy:${id}`),
        object: (id) => boardObjectId(`copy:${id}`),
      },
    );
    const pasted = reduceBoardDocument(document, command);
    expect(pasted.ok).toBe(true);
    if (!pasted.ok) return;
    const duplicate =
      pasted.document.objects[boardObjectId("copy:object:pressure-pen")];
    expect(duplicate?.kind).toBe("drawing.pen-stroke");
    if (duplicate?.kind !== "drawing.pen-stroke") return;
    expect(duplicate.ink).toEqual(stroke.ink);
  });
});
