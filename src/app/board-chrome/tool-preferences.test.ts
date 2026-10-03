import { describe, expect, it } from "vitest";

import {
  drawingToolPreferencesSchemaVersion,
  normalizeDrawingToolPreferences,
  readDrawingToolPreferences,
  writeDrawingToolPreferences,
} from "./tool-preferences";

describe("drawing tool preferences", () => {
  it("normalizes corrupt values to bounded defaults", () => {
    const value = normalizeDrawingToolPreferences({
      tools: {
        "drawing.pen": {
          fill: "bad",
          opacity: 8,
          stroke: "#112233",
          strokeStyle: "unknown",
          strokeWidth: 999,
        },
      },
    });
    expect(value.schemaVersion).toBe(drawingToolPreferencesSchemaVersion);
    expect(value.tools["drawing.pen"]).toMatchObject({
      opacity: 1,
      stroke: "#112233",
      strokeWidth: 3,
    });
  });

  it.each([
    ["thin", 0.5],
    ["thick", 1],
    ["marker", 3],
    ["wavy", 7.5],
  ] as const)(
    "preserves a manually selected %s width",
    (strokeStyle, strokeWidth) => {
      const value = normalizeDrawingToolPreferences({
      tools: {
        "drawing.pen": {
          fill: null,
          opacity: 1,
          stroke: "#245d6b",
          strokeStyle,
          strokeWidth,
        },
      },
    });

      expect(value.tools["drawing.pen"]).toMatchObject({
        strokeStyle,
        strokeWidth,
      });
    },
  );

  it("round-trips versioned preferences without entering BoardDocument", () => {
    let stored: string | null = null;
    const storage = {
      getItem: () => stored,
      setItem: (_key: string, value: string) => {
        stored = value;
      },
    };
    const preferences = normalizeDrawingToolPreferences({
      tools: { "drawing.line": { stroke: "#123456", strokeWidth: 7 } },
    });
    writeDrawingToolPreferences(preferences, storage);
    expect(
      readDrawingToolPreferences(storage).tools["drawing.line"],
    ).toMatchObject({
      stroke: "#123456",
      strokeWidth: 7,
    });
  });
});
