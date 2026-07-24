import {
  actorId,
  boardObjectId,
  commandId,
  createEmptyBoardDocument,
  documentId,
  groupId,
  type BoardDocument,
  type CommandMetadata,
  type RectangleObject,
} from "../../../src/core/public";
import boardDocumentFixture from "../../fixtures/board-document-0.1.json?raw";
import geometryImportFixture from "../../fixtures/geometry-import-board-document-0.1.json?raw";

export const actor = actorId("actor:test");

export function metadata(
  suffix: string,
  timestamp = "2026-07-24T12:01:00.000Z",
): CommandMetadata {
  return {
    actorId: actor,
    id: commandId(`command:${suffix}`),
    timestamp,
  };
}

export function emptyDocument(): BoardDocument {
  return createEmptyBoardDocument({
    id: documentId("document:test"),
    title: "Test board",
    createdAt: "2026-07-24T12:00:00.000Z",
  });
}

export function rectangle(
  suffix: string,
  options: {
    readonly group?: string;
    readonly locked?: boolean;
    readonly x?: number;
    readonly y?: number;
  } = {},
): RectangleObject {
  return {
    id: boardObjectId(`object:${suffix}`),
    kind: "drawing.rectangle",
    groupId: options.group === undefined ? null : groupId(options.group),
    locked: options.locked ?? false,
    position: { x: options.x ?? 0, y: options.y ?? 0 },
    rotation: 0,
    scale: { x: 1, y: 1 },
    source: { kind: "user" },
    style: {
      fill: null,
      opacity: 1,
      stroke: "#000000",
      strokeWidth: 2,
    },
    visible: true,
    size: { height: 80, width: 120 },
  };
}

export function loadBoardFixture(): Record<string, unknown> {
  return JSON.parse(boardDocumentFixture) as Record<string, unknown>;
}

export function loadGeometryImportFixture(): Record<string, unknown> {
  return JSON.parse(geometryImportFixture) as Record<string, unknown>;
}
