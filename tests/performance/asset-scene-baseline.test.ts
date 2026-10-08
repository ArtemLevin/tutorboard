import { describe, expect, it } from "vitest";

import {
  boardObjectId,
  createEmptyBoardDocument,
  createVectorInkData,
  documentId,
  selectBoardScene,
  serializeBoardDocument,
  type BoardDocument,
  type PenStrokeObject,
} from "../../src/core/public";

const counts = [100, 500, 1_000] as const;
const samples = 3;
const broadCiBudgetMs = 10_000;

function fixture(strokeCount: number): BoardDocument {
  const base = createEmptyBoardDocument({
    createdAt: "2026-10-08T15:00:00.000Z",
    id: documentId("document:f33:strokes:" + strokeCount),
    title: "F3.3.1 " + strokeCount + " ink strokes",
  });
  const strokes: PenStrokeObject[] = Array.from(
    { length: strokeCount },
    (_, index) => {
      const x = 12 + (index % 35) * 26;
      const y = 25 + Math.floor(index / 35) * 30;
      const points = [
        { x, y },
        { x: x + 6, y: y + 9 },
        { x: x + 15, y: y - 5 },
        { x: x + 24, y: y + 3 },
      ];
      const ink = createVectorInkData(
        points.map((point, sample) => ({
          point,
          pressure: 0.5,
          timestampMs: sample * 12,
        })),
      );
      return {
        groupId: null,
        id: boardObjectId("object:f33:stroke:" + index),
        ink,
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
          stroke: "#17202a",
          strokeWidth: 3,
        },
        visible: true,
      };
    },
  );
  return {
    ...base,
    objects: Object.fromEntries(strokes.map((stroke) => [stroke.id, stroke])),
    order: strokes.map((stroke) => stroke.id),
  };
}

function median(values: readonly number[]): number {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.floor(ordered.length / 2)] ?? 0;
}

describe("F3.3.1 ink-heavy board measurements", () => {
  for (const count of counts) {
    it(
      "records scene projection and document serialization with " +
        count +
        " strokes",
      () => {
        const board = fixture(count);
        const sceneMs: number[] = [];
        const serializedMs: number[] = [];
        let jsonBytes = 0;
        for (let sample = 0; sample < samples; sample += 1) {
          let started = performance.now();
          const scene = selectBoardScene(board);
          sceneMs.push(performance.now() - started);
          expect(scene.items).toHaveLength(count);

          started = performance.now();
          const written = serializeBoardDocument(board);
          serializedMs.push(performance.now() - started);
          expect(written.ok).toBe(true);
          if (!written.ok) throw new Error(written.issues[0]?.message);
          jsonBytes = new TextEncoder().encode(written.json).byteLength;
        }
        const result = {
          count,
          samples,
          sceneProjectionMedianMs: median(sceneMs),
          serializeMedianMs: median(serializedMs),
          jsonBytes,
        };
        expect(result.sceneProjectionMedianMs).toBeLessThan(broadCiBudgetMs);
        expect(result.serializeMedianMs).toBeLessThan(broadCiBudgetMs);
        console.info("F33_INK_BASELINE", JSON.stringify(result));
      },
    );
  }
});
