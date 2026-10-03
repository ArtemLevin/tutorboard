import { describe, expect, it } from "vitest";

import { strokeStyleSelectionPatch } from "./stroke-style-presets";

describe("stroke style selection presets", () => {
  it("applies recommended widths only to width presets", () => {
    expect(strokeStyleSelectionPatch("thin")).toEqual({
      strokeStyle: "thin",
      strokeWidth: 2,
    });
    expect(strokeStyleSelectionPatch("thick")).toEqual({
      strokeStyle: "thick",
      strokeWidth: 6,
    });
    expect(strokeStyleSelectionPatch("marker")).toEqual({
      strokeStyle: "marker",
      strokeWidth: 10,
    });
  });

  it("preserves current width for character-only styles", () => {
    const styles = [
      "dashed",
      "dash-dot",
      "wavy",
      "hand-pencil",
      "hand-pen",
    ] as const;

    for (const style of styles) {
      expect(strokeStyleSelectionPatch(style)).toEqual({ strokeStyle: style });
    }
  });
});
