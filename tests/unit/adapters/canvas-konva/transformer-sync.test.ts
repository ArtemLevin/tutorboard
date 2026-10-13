import { describe, expect, it } from "vitest";

import { needsTransformerSynchronization } from "../../../../src/adapters/canvas-konva/transformer-sync";

describe("Konva Transformer target reconciliation", () => {
  it("skips scanning when selection and attached nodes are both empty", () => {
    expect(needsTransformerSynchronization(0, 0)).toBe(false);
  });

  it("preserves attachment and updates with selected targets", () => {
    expect(needsTransformerSynchronization(1, 0)).toBe(true);
    expect(needsTransformerSynchronization(2, 2)).toBe(true);
  });

  it("preserves detachment of stale nodes after deselection", () => {
    expect(needsTransformerSynchronization(0, 1)).toBe(true);
  });
});
