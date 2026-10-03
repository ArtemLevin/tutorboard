import type { ObjectStyle, StrokeStyle } from "../../core/public";

const presetStrokeWidths: Readonly<Partial<Record<StrokeStyle, number>>> = {
  marker: 10,
  thick: 6,
  thin: 2,
};

export function strokeStyleSelectionPatch(
  strokeStyle: StrokeStyle,
): Partial<ObjectStyle> {
  const strokeWidth = presetStrokeWidths[strokeStyle];
  return strokeWidth === undefined
    ? { strokeStyle }
    : { strokeStyle, strokeWidth };
}
