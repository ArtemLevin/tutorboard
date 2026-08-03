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
