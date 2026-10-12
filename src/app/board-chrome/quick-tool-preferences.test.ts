import { describe, expect, it } from "vitest";

import {
  maxFavoriteTools,
  normalizeQuickToolPreferences,
  penPresetMatchesStyle,
  quickToolPreferencesStorageKey,
  readQuickToolPreferences,
  writeQuickToolPreferences,
} from "./quick-tool-preferences";

describe("quick tool preferences", () => {
  it("deduplicates favorites, ignores unknown tools, and enforces five-item limit", () => {
    const result = normalizeQuickToolPreferences({
      favorites: [
        "drawing.pen",
        "drawing.pen",
        "drawing.line",
        "malicious.tool",
        "editing.eraser",
        "selection.select",
        "presentation.laser",
        "drawing.text",
      ],
      penPresets: [{ stroke: "not-a-color", strokeWidth: -8 }],
      lastSelectedSlot: 9,
    });
    expect(result.favorites).toEqual([
      "drawing.pen",
      "drawing.line",
      "editing.eraser",
      "selection.select",
      "presentation.laser",
    ]);
    expect(result.favorites).toHaveLength(maxFavoriteTools);
    expect(result.penPresets[0]).toMatchObject({
      strokeWidth: 3,
      opacity: 1,
    });
    expect(result.lastSelectedSlot).toBe(0);
  });

  it("preserves user-selected pen widths, colors, transparency and styles", () => {
    const style = {
      stroke: "#123456",
      strokeWidth: 2.5,
      opacity: 0.6,
      strokeStyle: "wavy",
      fill: null,
    };
    const next = normalizeQuickToolPreferences({
      favorites: [],
      penPresets: [style, { ...style, stroke: "#abcdef", strokeWidth: 9 }],
      lastSelectedSlot: 1,
    });
    expect(next.penPresets[0]).toMatchObject(style);
    expect(next.penPresets[1]).toMatchObject({
      stroke: "#abcdef",
      strokeWidth: 9,
    });
    expect(next.lastSelectedSlot).toBe(1);
    expect(penPresetMatchesStyle(next.penPresets[0], style)).toBe(true);
    expect(penPresetMatchesStyle(next.penPresets[1], style)).toBe(false);
  });

  it("falls back safely for corrupt storage and keeps document preferences separate", () => {
    const corrupt = readQuickToolPreferences({
      getItem: () => "{broken-json",
    });
    expect(corrupt.favorites).toContain("drawing.pen");

    const writes: Array<[string, string]> = [];
    const storage = {
      getItem: () => writes[0]?.[1] ?? null,
      setItem: (key: string, value: string) => writes.push([key, value]),
    };
    const original = normalizeQuickToolPreferences({
      favorites: ["drawing.rectangle"],
      penPresets: [{ stroke: "#445566", strokeWidth: 4 }, null],
    });
    writeQuickToolPreferences(original, storage);
    expect(writes[0]?.[0]).toBe(quickToolPreferencesStorageKey);
    expect(readQuickToolPreferences(storage).favorites).toEqual([
      "drawing.rectangle",
    ]);
    expect(JSON.stringify(writes[0]?.[1])).not.toContain("BoardDocument");
    expect(() =>
      writeQuickToolPreferences(original, {
        setItem: () => {
          throw new Error("quota");
        },
      }),
    ).not.toThrow();
  });
});
