import { describe, expect, it } from "vitest";

import {
  boardObjectId,
  createEmptyBoardDocument,
  documentId,
  type BoardDocument,
  type BoardObject,
} from "../../src/core/public";
import {
  advanceEraserGesture,
  createEraserGestureSession,
} from "../../src/app/board/controllers/eraser-session";

const timestamp = "2026-10-04T10:00:00.000Z";
const objectCount = 1_000;
const windowSize = 30;
const absoluteWindowBudgetMs = 180;

const style = {
  fill: "#ffffff",
  opacity: 1,
  stroke: "#17202a",
  strokeWidth: 2,
} as const;

function rectangle(
  id: string,
  x: number,
  y: number,
): Extract<BoardObject, { kind: "drawing.rectangle" }> {
  return {
    groupId: null,
    id: boardObjectId(id),
    kind: "drawing.rectangle",
    locked: false,
    position: { x, y },
    rotation: 0,
    scale: { x: 1, y: 1 },
    size: { height: 36, width: 36 },
    source: { kind: "user" },
    style,
    visible: true,
  };
}

function sceneDocument(): BoardDocument {
  const empty = createEmptyBoardDocument({
    createdAt: timestamp,
    id: documentId("document:eraser-performance"),
    title: "Eraser performance",
  });
  const objects = Array.from({ length: objectCount }, (_value, index) =>
    rectangle(
      `object:eraser-${index}`,
      (index % 50) * 50,
      Math.floor(index / 50) * 50,
    ),
  );
  return {
    ...empty,
    objects: Object.fromEntries(objects.map((object) => [object.id, object])),
    order: objects.map(({ id }) => id),
  };
}

function advanceEmptyPath(
  session: ReturnType<typeof createEraserGestureSession>,
  start: number,
  count: number,
): number {
  const startedAt = performance.now();
  for (let index = start; index < start + count; index += 1) {
    advanceEraserGesture(session, [{ x: index * 2, y: 10_000 }], () => {
      throw new Error("Empty-path benchmark must not allocate fragments.");
    });
  }
  return performance.now() - startedAt;
}

describe("incremental eraser gesture performance", () => {
  it("keeps late move cost bounded independently of gesture history length", () => {
    const document = sceneDocument();

    const earlySession = createEraserGestureSession(document, 1, 12);
    advanceEmptyPath(earlySession, 0, 10);
    const earlyMs = advanceEmptyPath(earlySession, 10, windowSize);

    const lateSession = createEraserGestureSession(document, 2, 12);
    advanceEmptyPath(lateSession, 0, 500);
    const lateMs = advanceEmptyPath(lateSession, 500, windowSize);

    expect(earlyMs).toBeLessThan(absoluteWindowBudgetMs);
    expect(lateMs).toBeLessThan(absoluteWindowBudgetMs);
    expect(lateMs).toBeLessThanOrEqual(earlyMs * 3 + 25);
    expect(lateSession.lastProcessedPoint).toEqual({ x: 1_058, y: 10_000 });
  });
});
