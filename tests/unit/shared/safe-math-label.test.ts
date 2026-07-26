import { describe, expect, it } from "vitest";
import type { ReactElement } from "react";

import { createDefaultKonvaRendererRegistry } from "../../../src/adapters/canvas-konva/public";
import { boardObjectId, type TextObject } from "../../../src/core/public";
import { renderSafeMathLabel } from "../../../src/shared/safe-math-label";

const textObject: TextObject = {
  groupId: null,
  id: boardObjectId("object:math"),
  kind: "drawing.text",
  locked: false,
  position: { x: 0, y: 0 },
  rotation: 0,
  scale: { x: 1, y: 1 },
  source: { kind: "user" },
  style: { fill: "#000000", opacity: 1, stroke: null, strokeWidth: 0 },
  text: "$x^2 + \\alpha_1 = \\frac{1}{2}$",
  visible: true,
};

describe("safe math labels", () => {
  it("formats a bounded math subset as text without HTML", () => {
    expect(renderSafeMathLabel(textObject.text)).toEqual({
      accessibleText: "x^2 + alpha_1 = frac 1 2",
      displayText: "x² + α₁ = 1⁄2",
      math: true,
    });
    expect(renderSafeMathLabel("$<script>alert(1)</script>$").displayText).toBe(
      "‹script›alert(1)‹/script›",
    );
  });

  it("feeds only the safe display text to the Konva text node", () => {
    const rendered = createDefaultKonvaRendererRegistry().render({
      object: textObject,
      transforms: [],
    }) as ReactElement<{ readonly text: string }>;

    expect(rendered.props.text).toBe("x² + α₁ = 1⁄2");
  });
});
