import { describe, expect, it } from "vitest";

import { strokeStyleSelectionPatch } from "./stroke-style-presets";

describe("stroke style selection presets", () => {
  it.each([
    ["thin", 2],
    ["thick", 6],
    ["marker", 10],
  ] as const)("applies the %s recommended width once on selection", (style, width) => {
    expect(strokeStyleSelectionPatch(style)).toEqual({
      strokeStyle: style,
      strokeWidth: width,
    });
  });

  it.each([
    "dashed",
    "dash-dot",
    "wavy",
    "hand-pencil",
    "hand-pen",
  ] as const)("preserves the current width when selecting %s", (style) => {
    expect(strokeStyleSelectionPatch(style)).toEqual({ strokeStyle: style });
  });
});
